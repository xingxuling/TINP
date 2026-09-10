# 许可审计

本候选包用于资产所有者本地审查，远端仅使用用户已有私有 TINP 仓库，不执行公开发布。

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

alpha.2 未新增第三方代码副本或运行时依赖。DPAPI/文件锁适配由本仓库调用 Windows 与 Python 标准库；Microsoft 文档作为 API 参考，没有复制其示例实现。三个 donor 源码保持原样，原始来源清单继续适用。

alpha.3 仅增加本仓库维护入口、固定 RCL Profile 和测试，未引入第三方源码或新依赖。既有许可边界继续适用。

alpha.4 新增最小AAF来源：RNCS-Unified-Platform- 的 d345ecb9d8801a911f37534f40d7b9fdf5badb16，仅3个src文件及原LICENSE。复制固定git blob原始字节，未复制dirty工作树或未跟踪formal guard。原LICENSE只有一行Apache License 2.0声明，原样保留，不冒称其具有完整正文。逐文件blob与checkout换行差异见vendor/aaf/PROVENANCE.json。无新npm/Python依赖，仍仅内部第一方候选。

alpha.6 仅新增本仓库 JavaScript 的 authority registry adapter、CLI、独立测试 issuer 和文档；未复制 formal-gate 或 AAF registry 源码，也未引入新 npm/Python 依赖。formal-gate 的 pinned key/fingerprint 与 AAF revocation-registry 只作为设计审计 donor reference，既有 vendor 许可和来源边界继续适用。registry/issuer/member key 文件是调用方配置，不随源码包发布。

alpha.7 仅新增本仓库 JavaScript 的 authority registry distribution adapter、CLI 分支、独立测试 mirror signer、测试与文档；未复制第三方分发或共识源码，也未引入新 npm/Python 依赖。distribution policy、bundle、issuer/mirror/member key 文件是调用方配置，不随源码包发布。既有 donor 许可、内部使用限制和未公开发布结论继续适用。
