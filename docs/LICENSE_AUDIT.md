# 许可审计

本候选包用于资产所有者本地审查，不配置远端、不执行公开发布。

| 资产 | 固定版本 | 许可观察 | 本轮处理 |
| --- | --- | --- | --- |
| RCL | a7d6f7b，完整提交见 vendor/rcl/PROVENANCE.json | Apache-2.0，保留完整 LICENSE | 原样最小依赖源码与逐文件哈希 |
| TINP | 用户提供 v0.2.0-alpha.1 ZIP，哈希见 audit/upstream/input-provenance.json | LICENSE 仅两行 Apache License 2.0 + copyright | 原样保留，公开发行前补齐上游完整声明 |
| OPP | f7b76582a720d9d18af5153affa0fc2d78bc0410 | GitHub 当前源码未声明 LICENSE | 仅内部第一方快照，未重新许可 |
| Python jsonschema | requirements 中声明 >=4.23 | 安装环境外部依赖；不打包二进制 | 在使用环境安装，未修改 |
| Node/Python runtime | 使用本地已安装解释器 | 未随包复制运行时 | 环境要求与实际版本记入验证证据 |
| 两份 DOCX 规范 | 用户提供 v0.1/v0.2 | 用户资产，非外部引用授权 | 原样内部参考副本，内容不构成独立执行授权 |
| DWAC/USCE/DHSC/RNCS/BIGS/World Tree | 审计报告固定快照 | 本轮只读取/测试，部分未声明许可 | 不打包这些项目整仓；只保留审计与测试证据 |

当前结论：内部可复核源码候选已整理；对外许可与发行资格 **NOT_ADJUDICATED**。没有把 public GitHub 仓库等同于开放许可，也没有用本仓库许可证覆盖 donor 权利。
