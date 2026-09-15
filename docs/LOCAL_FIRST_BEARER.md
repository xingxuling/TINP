# TINP 本地优先承载层 v0.1

## 目标

让 TINP 不再把 `127.0.0.1` 回环链路当成唯一可运行边界，而能直接选择同一设备可见的本地网络接口，在同一 Wi-Fi / 有线局域网 / 已建立的 Wi-Fi Direct 或热点 IP 网络上交换 TINP `DATA` 帧。

这不是“免费互联网”。本轮只把**不经过公网出口的本地数据路径**建成正式候选承载层。

## 架构裁决

- **TINP** 继续拥有拓扑、寻址、发现、转发和传输承载。
- **OPP** 继续拥有对象/能力交换、CHP/RCP 协商语义；不新增一套 Wi-Fi 协议。
- **RCL** 负责承载准入硬门：端点策略、计费策略、可达性、安全下限、隐私下限与本地优先条件必须全部成立。
- 操作系统只负责把 Wi-Fi、以太网、热点或 Wi-Fi Direct 暴露为 IP 接口；TINP 不复制驱动栈。

## 新能力

`src/bearer-policy.mjs`：识别 loopback（回环）、LAN（局域网）、link-local（链路本地）、public（公网）端点，枚举本机接口并按 Wi-Fi→以太网→其他本地网络优先选择。

`rcl/bearer.rcl` + `adapters/rcl-bearer-guard.mjs`：通过固定 RCL 程序执行非补偿式准入。任何一项失败都不能提交承载选择。

`src/local-bearer.mjs`：把选中的真实非回环本地地址交给现有 `LocalTransport`，复用 TINP `DATA` framing、Ed25519 消息签名和现有 peer key admission。

`src/lan-discovery.mjs`：在 IPv4 局域网使用 TTL=1 的 multicast（组播）发送签名 `ROUTE_ADVERT`。发现到的未知节点只进入 candidate（候选）状态，不自动获得 authority（权限）。只有预置公钥 pin（固定公钥）或调用方显式允许 TOFU（首次使用信任）后才进入 transport peer set。

## 默认策略

```text
local-first 本地优先
├─ 回环：允许
├─ RFC1918 私有局域网：允许
├─ link-local 链路本地：允许
├─ metered 计费链路：默认拒绝
└─ public internet 公网出口：默认拒绝
```

调用方可以显式打开公网或计费链路，但不能由发现结果偷偷扩大权限。

## 已验证范围

本地沙箱针对当前候选实现执行 9 个定向测试：9/9 PASS（通过）。其中包含在**真实非 127.0.0.1 的私有 IPv4 接口**上创建两个 TCP TINP 节点、交换签名 `DATA` 请求/响应，以及在尝试连接 `8.8.8.8` 前由 local-first policy（本地优先策略）直接拒绝公网出口。

这证明的是“非回环 LAN socket + TINP framing 可以工作”，**不是**两台物理设备、Wi-Fi Direct 驱动、跨路由 Mesh、WPA 安全性或公网替代方案已经被验证。

## 下一现实验收

1. 两台真实手机/电脑接入同一 Wi-Fi；
2. 两端运行 `bindLocalNetworkTransport()`；
3. `LanPeerDiscovery` 发现对端；
4. 用户确认/预置 peer key；
5. OPP 完成能力协商；
6. TINP 直接在 LAN 地址上传输；
7. 断开公网但保留 Wi-Fi AP 后重复；
8. 再进入 Wi-Fi Direct / 手机热点 / 多跳 Mesh 适配。

只有第 1–7 项在真实设备通过后，才能把状态从 `LOCAL_RUNTIME_VERIFIED` 提升为 `PHYSICAL_LAN_VERIFIED`。
