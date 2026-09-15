# Integration Court｜TINP Local-First Bearer v0.1

## 目标裁决

允许 TINP 新增“本地优先承载器官”，但不把 Wi-Fi、以太网或公网升级成新的 authority owner。OPP 语义保持不变，RCL 持有承载准入硬门。

## 影响模块

- `src/transport.mjs`
- `src/bearer-policy.mjs`
- `src/local-bearer.mjs`
- `src/lan-discovery.mjs`
- `rcl/bearer.rcl`
- `adapters/rcl-bearer-guard.mjs`
- `sdk/v1.mjs`
- 定向测试与本证据目录

## 验收标准

- 旧 `LocalTransport` 默认仍绑定 `127.0.0.1`，不要求调用方改变现有代码。
- 只有显式传入 network policy（网络策略）时才允许 non-loopback（非回环）绑定。
- local-first 默认拒绝 public egress（公网出口）与 metered（计费）链路。
- RCL bearer gate（承载准入门）所有条件必须同时为真。
- LAN advertisement（局域网公告）签名必须有效；发现不等于授权；未知公钥不得静默进入 peer set。
- 至少一次真实非回环私有 IPv4 socket 请求/响应通过。

## 测试结果

本地隔离工作区执行：

`node --test tests/*.test.mjs`

针对本轮新增/修改模块的 9 个定向测试：**9/9 PASS**。

覆盖：地址分类、计费拒绝、Wi-Fi 优先选择、签名局域网公告、pin 冲突拒绝、未知 peer 不自动信任、RCL 全合取门、非回环私网 TCP TINP DATA 往返、公网出口前置拒绝。

## 安全裁决

PASS / BOUNDED（通过 / 有边界）。

发现阶段只证明“此公告由公告里给出的密钥签名”，不能证明该密钥属于现实中的某个人或设备；因此默认 `trust=unverified`。OPP 协商也不能替代 identity/authority admission（身份/权限准入）。

## 风险与回滚

- 新接口只在调用方显式选择 local-first bearer 时启用；旧回环默认路径保持。
- 如真实设备出现多网卡、VPN、IPv6 或 multicast（组播）兼容问题，可回退到手动固定 LAN endpoint；不需要删除 TINP/OPP/RCL 既有语义。
- `LanPeerDiscovery` v0.1 只实现 IPv4 multicast；IPv6 discovery、Wi-Fi Direct 建链和多跳 Mesh 不在本轮宣称范围。

## Evidence Ledger

状态：`LOCAL_RUNTIME_VERIFIED / PHYSICAL_LAN_PENDING`

不宣称：真实两设备 Wi-Fi 已验证、Wi-Fi Direct 已验证、Mesh 已验证、免费公网已实现、生产安全认证。
