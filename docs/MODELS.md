# API 提供商与功能分配

伴读雀提供 **33 种连接选项**：20 种 LLM 提供商、9 种兼容 API 提供商，以及 4 种纯翻译服务。安装后只创建一个 OpenAI 示例，按需添加账户。每个 AI 提供商条目使用一个模型；同一账户需要多个模型时可点击「复制」。

## 提供商范围

- **LLM**：OpenAI、DeepSeek、Gemini、Anthropic、Grok、Azure、Amazon Bedrock、Groq、DeepInfra、Mistral AI、Together.ai、Cohere、Fireworks AI、Cerebras、Replicate、Perplexity、Ollama、阿里云百炼、Moonshot AI、Hugging Face。
- **兼容 API**：自定义 Chat Complete、自定义 Responses、Jalapeno Cloud、Atlas Cloud、OpenRouter、MiniMax、硅基流动、Tensdaq、Volcengine。
- **纯翻译**：DeepL、DeepLX、Google 翻译、Microsoft 翻译。它们无需模型 ID，只能分配给翻译；不显示温度、推理强度和流式输出选项。

目录覆盖 Read Frog 的全部 31 种可配置 API 类型，并提供其 Google 与微软翻译选项。Read Frog 的「内置 AI」「高级内置 AI」属于其账号和托管服务，不是可直接复用的第三方 API，伴读雀不使用这些服务或登录入口。

## 连接设置

| 类型 | 配置方式 |
| --- | --- |
| OpenAI 及兼容平台 | Base URL、API Key、模型 ID，使用 Chat Completions |
| Anthropic | 原生 Messages API，使用 `x-api-key` |
| Gemini | 原生 GenerateContent API；显式配置以 `/openai` 结尾的兼容地址时使用 Chat Completions |
| Azure | 资源名称、部署 ID、Responses 或 Chat 模式、API 版本；可覆盖 Base URL |
| Amazon Bedrock | Bedrock API Key、AWS 区域、模型或推理配置 ID；使用 Converse API |
| Cohere | 原生 v2 Chat API |
| 自定义 Responses | 完整 Responses URL、API Key、模型 ID |
| Replicate | API Token、`owner/name` 或 `owner/name:version`；文字 Predictions，支持轮询、流式与取消 |
| Ollama | 连接已有服务，默认 `http://127.0.0.1:11434/api`；不下载或管理本地模型 |
| DeepL | API Key；官方地址遇到 `:fx` 密钥时自动选择 Free API |
| DeepLX | 完整翻译 URL；可使用 `{{apiKey}}` 占位符引用单独保存的密钥 |
| Google、微软翻译 | 无需 API Key；可用性和限制取决于服务与网络 |

所有连接统一使用本机加密凭据、请求超时、自定义请求头和每个提供商的代理配置。可选择跟随系统、禁用或自定义代理，模型发现、测试连接、文字与图片请求均遵循该设置。[代理说明](PROXY.md)

支持流式的 LLM 会逐步展示结果；半截响应、取消和错误不会写入成功缓存。结构化指令会按对应协议发送输出 Schema，服务明确拒绝结构化参数时仅在尚未输出内容前重试一次；最终字段仍由本机校验。

## 默认模型与候选

默认值、候选 ID 和顺序取自 Read Frog 提交 [96083134](https://github.com/mengxi-ream/read-frog/tree/96083134b111e56762f578b143bcd48e85058ba3)，共 **418 个文字模型候选**。候选不等于账户已开通该模型，实际可用性由服务端决定。

| 提供商 | 新增时的模型 | 文字候选数 |
| --- | --- | --- |
| openrouter | `google/gemma-4-31b-it:free` | 6 |
| jalapenocloud | `GLM-5.2` | 13 |
| atlascloud | `deepseek-ai/deepseek-v4-flash` | 17 |
| 自定义 Chat Complete | 用户填写 | 0 |
| 自定义 Responses | 用户填写 | 0 |
| openai | `gpt-6-luna` | 31 |
| azure | `gpt-5.6-luna` | 28 |
| deepseek | `deepseek-v4-flash` | 4 |
| Gemini | `gemini-3.5-flash-lite` | 20 |
| anthropic | `claude-haiku-5-5` | 17 |
| xai | `grok-4.3` | 7 |
| bedrock | `us.amazon.nova-micro-v1:0` | 71 |
| groq | `openai/gpt-oss-20b` | 18 |
| deepinfra | `Qwen/Qwen3.5-9B` | 30 |
| mistral | `mistral-small-latest` | 19 |
| togetherai | `Qwen/Qwen3.5-9B` | 18 |
| cohere | `command-a-translate-08-2025` | 8 |
| fireworks | `accounts/fireworks/models/gpt-oss-120b` | 23 |
| cerebras | `gpt-oss-120b` | 9 |
| replicate | `meta/meta-llama-3.1-70b-instruct` | 2 |
| perplexity | `perplexity/sonar` | 6 |
| ollama | `gemma3:4b` | 4 |
| 硅基流动 | `Qwen/Qwen3-Next-80B-A3B-Instruct` | 1 |
| tensdaq | `Qwen3-30B-A3B-Instruct-2507` | 2 |
| volcengine | `doubao-seed-1-6-flash-250828` | 3 |
| minimax | `MiniMax-M2.7` | 9 |
| 阿里云百炼 | `qwen3.8-flash` | 23 |
| moonshotai | `kimi-k2.6` | 10 |
| huggingface | `Qwen/Qwen3.5-9B` | 19 |

模型列表直接在输入框下展开，支持搜索、键盘选择和自定义 ID。硅基流动、Tensdaq、Volcengine 按上游开启自定义模式并预填默认值；两个自定义协议入口保留空 ID。已有非空模型不会被目录更新覆盖。

模型发现支持对应服务的列表格式与分页。Azure、Bedrock、Perplexity 使用内置列表或手动输入。发现失败或返回空列表不会清空所选模型；缓存按提供商、协议、地址、原生设置和代理隔离。

OpenAI 额外提供 `gpt-4o-mini-tts`、`tts-1`、`tts-1-hd` 语音分组。图片能力信息独立维护，未知能力可通过样例测试确认。Replicate 当前仅接入文字预测，纯翻译服务和已知纯文本模型不出现在 OCR 选择中。

通过 `npm run models:sync -- .reference/read-frog <commit>` 可重新提取目录。脚本读取静态数据，不执行参考项目代码；上游来源随快照记录。

## 连接测试

连接测试会在按钮内显示「测试中…」「成功」或「失败」，完成耗时超过 3 秒时显示「缓慢（建议调节思考模式）」，5 秒后恢复为「测试连接」。失败时可悬停查看原因。测试不会把模型回复放到页面顶部；修改连接设置后，旧的测试反馈会失效。

## 等待与思考过程

翻译和自定义 AI 指令使用 LLM 时，结果上方显示「思考中」，配合动态图标和文字高光。提供商返回可读的思考内容或思考摘要后，可展开查看；默认折叠，展开区域内部滚动。手动向上阅读时暂停自动滚动，重新展开后继续跟随新内容。开始输出答案时切换为「思考完成」；后续若再次收到思考片段，会恢复「思考中」。纯翻译提供商使用简洁的加载图标。

支持兼容接口的 `reasoning_content`、`reasoning` 与可读 `reasoning_details`，以及原生协议的 reasoning 事件和非流式结果。仅显示提供商实际返回的可读内容，不显示签名、加密数据或推测生成的思考。Gemini 思考模型请求可读思考，Responses 在启用推理时请求摘要；提供商、模型与推理设置决定是否返回这些内容。

思考与答案独立传输，复制、朗读和笔记只使用答案。成功结果的内存缓存同时保留思考，遵循相同的时间和容量限制；取消、失败或不完整结果不写入缓存。停止或失败后结束动画，保留已收到的思考；新一轮指令从空状态开始。

## 功能分配

展开提供商中的「功能提供商」，或使用页面下方的功能分配区域，可为翻译、词典、写作改进、自定义指令、猜你想存、OCR、在线朗读和语言检测选择适用的提供商。两个入口即时联动，未单独指定的指令继承默认 LLM，结果窗口可临时切换。

OCR 默认使用内置离线引擎；远程识别需选择支持图片的 LLM。语言检测默认在本机完成，LLM 模式最多发送 500 个字符，失败时回到本地检测。在线朗读支持 OpenAI 兼容语音接口与 Azure 语音部署，系统离线语音始终可用。

## 验证范围

协议测试覆盖所有 Chat Completions 预设，以及原生 JSON、流式终止与截断、图片输入、翻译语言映射、Replicate 任务处理、模型发现和错误脱敏。桌面回归检查 33 项添加、默认模型、自动保存、复制、功能分配、原生设置、深浅色图标、代理与结果显示。

测试使用隔离配置与本地 HTTP 服务，不代表拥有或逐一验收了所有供应商的付费账户。[桌面验证记录](provider-parity-verification.json)
