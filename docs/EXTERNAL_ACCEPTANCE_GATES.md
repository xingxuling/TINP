# TINP 外部验收门协议（alpha.29 之后）

本文件把下一阶段的真实门槛固定成可执行的黑盒验收协议。它是接口与证据要求，不是 Authority Provider、HSM、透明日志或第三方审计的替代实现。

## 1. Authority Provider admission

只有一个外部 Owner 能提供下列全部证据时，TINP 才会接入只读 staging adapter。每个表面都必须有公开契约、可重放记录、签名者身份和失败样例：

| 门 | 必须证明 | 当前裁决 |
| --- | --- | --- |
| 身份注册 | 人员/组织/设备 enrollment、唯一 Owner 身份、责任边界 | `BLOCKED_EXTERNAL_OWNER` |
| 在线发布 | 带序列、前根、有效期和发布回执的在线签名快照 | `BLOCKED_EXTERNAL_OWNER` |
| 在线撤销 | issuer/member/key 撤销流、断线重连和陈旧缓存拒绝 | `BLOCKED_EXTERNAL_OWNER` |
| 可信时间 | 可独立验证的时间 token、偏差和 freshness 规则 | `BLOCKED_EXTERNAL_OWNER` |
| HSM/硬件托管 | 硬件或等价保护、操作员分离、轮换和备份记录 | `BLOCKED_EXTERNAL_OWNER` |
| 透明日志 | inclusion/consistency proof、checkpoint 和独立镜像 | `BLOCKED_EXTERNAL_OWNER` |
| 真实设备注册 | 设备身份、注册状态、轮换和注销的在线证据 | `BLOCKED_EXTERNAL_OWNER` |
| 密钥丢失恢复 | 恢复流程、旧 key 不复活、事件记录和人工批准 | `BLOCKED_EXTERNAL_OWNER` |
| 跨物理机收敛 | 两台独立主机重放同一历史、检测 fork/skip/mirror drift | `BLOCKED_EXTERNAL_OWNER` |
| 生产冲突裁决 | 公开冲突政策、法定/人工 owner、不可逆裁决回执 | `BLOCKED_EXTERNAL_OWNER` |

TINP 只消费公钥、签名、时间证明和认证后的恢复声明。私钥、人员身份法律判断、HSM 管理和不可逆生产批准仍属于外部 Owner。

## 2. 两台或更多独立物理机器

验收必须由两个独立物理主机完成，不能用同机进程、loopback、容器快照或临时目录替代。每台主机分别记录：硬件/OS 标识、时钟来源、部署包 SHA-256、配置根、网络路径、运行日志和操作者签名。测试顺序固定为：

1. 主机 A 注册设备并取得初始快照与透明日志 checkpoint。
2. 主机 B 通过在线发布接口获取同一序列，独立验证签名、可信时间和 inclusion proof。
3. 在 A/B 分别注入 revoked、skipped、same-sequence-conflict、mirror-drift、stale-cache 和 provider-outage 场景。
4. 恢复连接后，双方必须收敛到同一已认证根；冲突必须保留为 `UNRESOLVED_CONFLICT`，不能由本地优先级猜选赢家。
5. 将完整证据包交给外部审查者复放；只要任一主机身份、时间、日志或网络路径无法独立确认，整门保持 `NOT_RUN`。

## 3. 独立第三方 Consumer / 安全审计

第三方必须事先不知道 TINP 内部实现细节，只拿到版本化 release 包、公开协议和黑盒 endpoint。第三方提交的 consumer receipt 至少绑定：

- 第三方组织/联系人和独立公钥指纹；
- 使用的 release 包 SHA-256、操作系统、运行时和网络环境；
- 自己实现的 request/response adapter 版本与源码仓库；
- producer/consumer 结果根、原始日志 SHA-256 和时间证明；
- 成功用例以及 revoked、重放、改根、超时、未知字段和无权限用例；
- 第三方声明未导入 TINP 私有 fixture、未复用 TINP consumer 实现；
- 安全审计报告、范围、未解决问题和独立审计者签名。

TINP 只验证 receipt 结构、内容根和协议约束；“独立”由第三方身份、源码、环境和审计者共同证明，不能由 TINP 自己的一次回放宣称。缺少任何一项时，状态为 `NOT_RUN`，不得写成 `PASS`。

## 4. Admission rule

外部 Authority Provider、双物理机和独立第三方 Consumer/审计三组证据必须同时达到 `PASS`，并经过人工 Integration Court 批准，才允许进入生产候选。当前 alpha.29 仅有本机候选验证和 OPP 原生 interop acceptance；本文件对应的机器清单见 [`audit/external-acceptance-gates-2026-09-12.json`](../audit/external-acceptance-gates-2026-09-12.json)。

在真实 Owner、硬件、账号、第三方提交物和人工裁决到位前，TINP 保持 `NOT_DEPLOYED`，不生成 synthetic authority、不伪造可信时间、不把自身 consumer 当作第三方 consumer。
