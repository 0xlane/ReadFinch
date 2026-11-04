# macOS 固定签名与权限连续性

本项目使用一套固定的自签名代码证书，为各次构建提供一致的代码身份。它不提供 Apple Developer ID、公证或 Gatekeeper 的默认信任。初次下载仍可能需要用户在系统设置中允许打开；从旧的临时签名版本迁移时，需要重新授权一次辅助功能和录屏。

## 材料与保管

- `build/macos-signing.pem` 是公开证书，随源码保存。
- 私钥封装在加密的 `identity.p12` 中，默认本机目录为 `~/Library/Application Support/ReadFinch Signing`。目录权限为 `0700`，私钥包与密码文件权限为 `0600`。应单独备份此目录。
- GitHub Actions 使用仓库 Secrets `READFINCH_MACOS_SIGNING_P12`（base64 编码的加密私钥包）和 `READFINCH_MACOS_SIGNING_PASSWORD`。私钥和密码不得进入源码、构建日志或发行附件。
- `node scripts/macos-signing.mjs init` 只用于首次建立身份。如果仓库已有公开证书，命令会拒绝重新生成。更换证书会改变权限身份，应作为明确的迁移处理。
- `npm run signing:check` 验证本机或 CI 材料与公开证书匹配。缺少 CI 材料时构建直接失败，不退回临时签名。

## 构建

`scripts/sign-macos.mjs` 是 electron-builder 的自定义签名入口。`mac.identity: "-"` 仅用于让 electron-builder 调用该入口；最终产物必须由固定证书签名，不能是 ad-hoc 签名。

签名使用固定版本的开源 `rcodesign`，下载前后检查仓库固定的 SHA-256。它直接读取加密 PKCS#12 材料，不往用户机器安装根证书，也不修改用户的证书信任设置。签名临时材料放在私有临时目录，完成或失败后删除。主应用、嵌入应用、框架与原生助手都签名；原生助手采用固定标识 `app.readfinch.ReadFinch.selection-helper`。

每个代码身份同时绑定标识和证书指纹，不能简化成仅匹配应用名称。非 bundle 二进制的标识由稳定的包内路径生成，不包含二进制内容哈希。

## 验证

`node scripts/verify-macos-signing.mjs <app-path>` 检查代码身份、公钥证书、CMS 密码学签名与代码页摘要。未经 Apple 信任的自签名证书会使普通 `codesign --verify` 报证书不受信任，这与签名数据被篡改是不同问题。

在一次性 GitHub macOS runner 中，`--ci` 会临时将固定证书作为仅供 `/usr/bin/codesign` 使用的校验锚，运行原生 `--deep --strict` 校验及身份规则校验，随后清理该信任和证书。这一步只发生在一次性构建主机，不在发行应用或用户机器上执行；它不代表 Gatekeeper 或 Apple 公证通过。

发布前仍需进行真实的权限连续性验证：正常启动 A 构建并授权，退出后用 B 构建覆盖同一路径，通过 Finder 启动，确认两项权限及原生助手正常。不得用从有权限的测试宿主派生的 Electron 进程代替该检查。

## 2026-11-04 本机验证

在 macOS 15.8.1 / Intel x64 上，固定签名的 1.2.1 测试构建完成一次初始授权，再覆盖为真正重新编译的 1.2.3 构建。主程序和原生助手的代码哈希均改变，15 个对象的身份规则保持一致。通过 Finder 正常启动 1.2.3 后，辅助功能与录屏提示均未出现，原生助手直接连接；没有再次操作授权，也没有安装或信任根证书。

这证明了本次构建之间的授权连续性。其他 macOS 版本仍需要回归；证书轮换、系统隐私策略变化或用户撤销授权不能由签名方案消除。

资料：[Apple 代码身份说明](https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements) · [rcodesign 签名文档](https://gregoryszorc.com/docs/apple-codesign/stable/apple_codesign_rcodesign_signing.html)
