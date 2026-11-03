import { setTimeout as delay } from "node:timers/promises";
import type { TextProfile } from "../shared/config";
import { t } from "../shared/i18n";
import {
  request,
  responseJson,
  providerAuth,
  endpointUrl,
  ProviderError,
  httpError,
  type Connection,
} from "./provider-http";

function checkedUrl(value: unknown, endpoint: string, stream = false) {
  if (typeof value !== "string")
    throw new ProviderError("protocol", t("预测服务未返回有效的任务地址"));
  const url = new URL(value, endpoint),
    base = new URL(endpoint);
  const officialStream =
    stream &&
    base.origin === "https://api.replicate.com" &&
    [
      "https://stream.replicate.com",
      "https://streaming.api.replicate.com",
    ].includes(url.origin);
  if (
    (url.origin !== base.origin && !officialStream) ||
    url.username ||
    url.password
  )
    throw new ProviderError("protocol", t("预测服务返回了不可信的任务地址"));
  return url.href;
}
function outputText(output: unknown) {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && output.every((v) => typeof v === "string"))
    return output.join("");
  return "";
}
async function streamOutput(
  response: Response,
  onText: (text: string) => void,
) {
  if (!response.ok) {
    await response.body?.cancel();
    throw httpError(response.status);
  }
  if (!response.body)
    throw new ProviderError("protocol", t("服务没有返回响应体"));
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    text = "",
    finished = false;
  const consume = (event: string) => {
    const lines = event.split("\n");
    const type = lines
      .find((line) => line.startsWith("event:"))
      ?.slice(6)
      .trim();
    const data = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (type === "error")
      throw new ProviderError("service", t("服务在生成中返回错误，请稍后重试"));
    if (type === "output") {
      text += data;
      if (text.length > 1_000_000)
        throw new ProviderError("limit", t("结果过长，已停止接收"));
      onText(text);
    }
    if (type === "done") {
      let payload;
      try {
        payload = JSON.parse(data || "{}");
      } catch {
        throw new ProviderError(
          "protocol",
          t("流式响应格式无效，可关闭流式后重试"),
        );
      }
      if (payload.reason)
        throw new ProviderError(
          "incomplete",
          t("模型未返回完整结果，可重新生成。"),
        );
      finished = true;
    }
  };
  try {
    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      let end;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        consume(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (finished) break;
      }
      if (buffer.length > 1_000_000)
        throw new ProviderError("limit", t("流式响应超出限制"));
    }
    if (!finished && buffer.trim()) consume(buffer + decoder.decode());
    if (!finished)
      throw new ProviderError(
        "interrupted",
        t("连接中断，已保留收到的部分结果；可重试"),
      );
    return text;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function completeReplicate(
  profile: Connection<TextProfile>,
  messages: unknown[],
  key: string | undefined,
  signal: AbortSignal,
  onText: (text: string) => void,
) {
  const deadline = AbortSignal.any([
    signal,
    AbortSignal.timeout(profile.timeoutMs),
  ]);
  const headers = providerAuth(profile, key);
  const match =
    /^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?::([a-zA-Z0-9_.-]+))?$/.exec(
      profile.model,
    );
  if (!match)
    throw new ProviderError(
      "model",
      t("Replicate 模型格式应为 owner/name 或 owner/name:version"),
    );
  const content = (message: any) => {
    if (typeof message.content === "string") return message.content;
    if (
      !Array.isArray(message.content) ||
      message.content.some((p: any) => p.type !== "text")
    )
      throw new ProviderError("capability", t("此模型仅支持文字输入"));
    return message.content.map((p: any) => p.text).join("\n");
  };
  const system = messages
    .filter((m: any) => m.role === "system")
    .map(content)
    .join("\n");
  const prompt = messages
    .filter((m: any) => m.role !== "system")
    .map(content)
    .join("\n");
  let prediction: any;
  let completed = false;
  try {
    const path = match[3]
      ? "predictions"
      : "models/" + match[1] + "/" + match[2] + "/predictions";
    prediction = await responseJson(
      await request(
        endpointUrl(profile.endpoint, path),
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            ...(match[3] ? { version: match[3] } : {}),
            stream: profile.stream,
            input: {
              prompt,
              ...(system ? { system_prompt: system } : {}),
              ...(profile.temperature != null
                ? { temperature: profile.temperature }
                : {}),
            },
          }),
        },
        deadline,
        profile.timeoutMs,
        profile,
      ),
    );
    let text = "";
    if (
      profile.stream &&
      prediction.urls?.stream &&
      !["succeeded", "failed", "canceled"].includes(prediction.status)
    ) {
      const url = checkedUrl(prediction.urls.stream, profile.endpoint, true);
      const streamHeaders = new Headers(headers);
      streamHeaders.set("Accept", "text/event-stream");
      // Official signed stream URLs need no account credentials or user-supplied headers.
      const streamInit =
        new URL(url).origin === new URL(profile.endpoint).origin
          ? streamHeaders
          : new Headers({ Accept: "text/event-stream" });
      text = await streamOutput(
        await request(
          url,
          { headers: streamInit },
          deadline,
          profile.timeoutMs,
          profile,
        ),
        onText,
      );
    } else {
      while (true) {
        if (["failed", "canceled"].includes(prediction.status))
          throw new ProviderError(
            "service",
            t("模型未返回完整结果，可重新生成。"),
          );
        const current = outputText(prediction.output);
        if (current.length > 1_000_000)
          throw new ProviderError("limit", t("结果过长，已停止接收"));
        if (current && current !== text) {
          text = current;
          if (profile.stream) onText(text);
        }
        if (prediction.status === "succeeded") break;
        const next = checkedUrl(prediction.urls?.get, profile.endpoint);
        await delay(250, undefined, { signal: deadline });
        prediction = await responseJson(
          await request(
            next,
            { headers },
            deadline,
            profile.timeoutMs,
            profile,
          ),
        );
      }
      if (!profile.stream && text) onText(text);
    }
    if (!text.trim())
      throw new ProviderError("empty", t("模型返回空结果，请检查输入和模型"));
    completed = true;
    return text;
  } catch (error) {
    if (deadline.aborted)
      throw new ProviderError(
        signal.aborted ? "cancelled" : "timeout",
        signal.aborted ? t("请求已取消") : t("请求超时，已保留部分结果"),
      );
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(
      "protocol",
      t("服务返回的数据格式无效，请检查接口兼容性"),
    );
  } finally {
    if (
      !completed &&
      prediction?.urls?.cancel &&
      !["succeeded", "failed", "canceled"].includes(prediction.status)
    ) {
      try {
        const url = checkedUrl(prediction.urls.cancel, profile.endpoint);
        const response = await request(
          url,
          { method: "POST", headers },
          AbortSignal.timeout(3000),
          3000,
          profile,
        );
        await response.body?.cancel();
      } catch {
        /* Cancellation is best effort; the original error remains useful. */
      }
    }
  }
}
