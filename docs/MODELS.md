# API 提供商与功能分配

一个提供商包含一组连接设置和一个模型。点击模型输入框，候选列表在字段旁展开，可直接搜索内置 ID 或获取该端点的模型列表。勾选「输入自定义模型 ID」即可直接填写私有模型，也可在搜索结果中选择使用输入的完整 ID。选择结果自动保存。

同一账号需要第二个模型时，点击表单底部的「复制」。副本具有独立的名称、模型和用途。地址、温度、流式偏好、超时、OCR 指令和端点绑定的本机凭据随副本复制。

展开「功能提供商」可将这个提供商用于翻译、猜你想存、词典、润色、OCR、在线朗读、语言检测或自定义动作。页面下方同时提供按功能分配的入口，两处修改即时联动。动作可继承默认提供商。结果窗口底部可临时选择其他提供商。

「猜你想存」使用独立的推荐提供商。翻译模型可以和它不同。推荐的词条采用「通用 → 猜你想存」中指定的指令与笔记本。切换翻译目标语言会重新生成对应语言的释义。

截图识别默认使用内置离线 OCR。也可在「截图识别」选择已添加的提供商，已知纯文本模型不出现在列表中。自定义模型的图片输入能力可用中英文样例验证。使用外部服务识别截图前会先显示本地预览。

语言检测默认使用本地基础检测。选择 LLM 后可指定提供商，在翻译时自动识别源语言会发送最多 500 个字符，失败后回到本地检测。朗读优先采用明确指定的语言，其余情况在本机判断。

在线朗读使用 `POST /audio/speech`。在「功能提供商」中分配语音模型，也可以从「文本转语音」选择同一提供商。请求使用该提供商的模型、密钥、自定义请求头与超时。默认音色列表可搜索，也可补充服务认可的音色 ID。「测试连接」会在分配后向该语音模型发送一段短文本。[语音接口说明](https://developers.openai.com/api/docs/guides/text-to-speech)

## 内置候选

文字与视觉目录核对于 2026-10-31，语音目录核对于 2026-11-03。目录提供 18 个起始候选，不以枚举限制用户可填写的模型 ID。账户权限、地域、服务状态仍需连接测试确认。目录元数据不表示本应用已调用真实供应商进行效果验收。

| 服务商 | 内置 ID | 官方依据 |
| --- | --- | --- |
| OpenAI | `gpt-5.4-mini`、`gpt-4.1-mini`、`gpt-4o-mini` | [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)、[GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)、[GPT-4o mini](https://developers.openai.com/api/docs/models/gpt-4o-mini) |
| OpenAI 语音 | `gpt-4o-mini-tts`、`tts-1`、`tts-1-hd` | [语音模型与可用音色](https://developers.openai.com/api/docs/guides/text-to-speech) |
| DeepSeek | `deepseek-flash`、`deepseek-v4-pro` | [模型与能力](https://api-docs.deepseek.com/quick_start/pricing/) |
| 百炼 | `qwen3.7-plus`、`qwen3.8-max`、`qwen3.8-flash` | [模型目录](https://help.aliyun.com/zh/model-studio/models) |
| 硅基流动 | `Qwen/Qwen3.5-397B-A17B`、`Qwen/Qwen2.5-VL-72B-Instruct` | [多模态输入与请求示例](https://docs.siliconflow.cn/docs/userguide/capabilities/multimodal-vision) |
| Gemini | `gemini-3.5-flash-lite`、`gemini-3.8-flash` | [3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)、[3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) |
| OpenRouter | `openai/gpt-4.1-mini`、`google/gemini-3.8-flash`、`deepseek/deepseek-v4-pro` | [GPT-4.1 mini](https://openrouter.ai/openai/gpt-4.1-mini)、[Gemini 3.8 Flash](https://openrouter.ai/google/gemini-3.8-flash)、[DeepSeek V4 Pro](https://openrouter.ai/deepseek/deepseek-v4-pro) |

候选合并顺序：内置目录、接口发现、已配置模型和动作引用；按完整 ID 去重。接口发现缓存按服务商 ID 与端点隔离，改地址后不会显示旧端点发现的模型。已保存的自定义 ID 会随配置迁移，发现缓存不作为可迁移配置。

新增或更新候选时修改 `src/shared/models.ts`，核查官方 ID 与图片输入能力，更新本表日期；保留未知能力，不凭名称推断。API Key 和端点不写入目录。

## 陪读蛙参考

参考 [Read Frog 1.54.1](https://github.com/mengxi-ream/read-frog) 的 `utils/constants/models.ts`、`translate-model-selector.tsx`、`components/model-suggestion-button.tsx` 和 `provider-editor.tsx`：内置候选、接口补充、自定义模型、功能分配。TextHop 将这些入口整合到统一的可搜索选择器，同一账户可通过复制提供商分别配置模型。未复用其私有布局引擎。

## 配置与验证

schema v6 将旧模型库拆为独立提供商，并保留已绑定的动作、OCR、语言检测和本机端点凭据。配置文件只包含模型和非敏感偏好。

[设置验证](settings-verification.json)覆盖候选搜索、复制账户、双向绑定、温度、自定义请求头、OCR 提供商和界面语言切换。文字与视觉服务使用本机 HTTP 测试端点。
