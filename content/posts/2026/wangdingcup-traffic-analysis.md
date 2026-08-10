---
title: 网鼎杯流量分析两道题WP
date: 2026-08-10
category: 安全
type: tech
---

最近接触了两道网鼎杯的流量分析题目，一道是 4G 核心网信令分析，另一道是冰蝎 Webshell 加密流量解密。做完之后觉得挺有意思的，记录一下解题过程。

---

## 题目一：网鼎杯 MME 流量分析

### 题目描述

某单位网络遭到非法攻击，安全人员对流量调查取证之后保存了关键证据，发现人员的定位信息存在泄露，请对其进行分析。flag 为用户位置信息进行 32 位 MD5 哈希值。

入手文件 `MME.cap`，共 141 个数据包。

### 分析过程

用 Wireshark 打开流量包，一眼看到大量 SCTP 和 GTPv2 协议的数据包。SCTP 通信双方为 `1.1.1.1` 和 `2.2.2.2`（S1AP 信令），GTP-C 通信双方为 `14.66.12.4` 和 `14.66.50.4`（端口 2123）。这是典型的 4G/LTE EPC（演进分组核心网）架构通信流量。

从 SCTP 的 S1AP 消息中可以看到可读的字符串信息，提取到：

```
mmec60.mmegi0361.mme.epc.mnc008.mcc460.3gppnetwork.org
```

- **MCC** = 460（中国）
- **MNC** = 008（中国移动）
- **MMEGI** = 0361（MME 组标识）
- **MMEC** = 60（MME 码）

题目要求找出用户的物理位置信息。在 4G 网络中，**ECGI（E-UTRAN 小区全局标识符）** 用于在全球范围内唯一标识一个基站的特定扇区（小区）。通过基站数据库就能查出该基站的精确经纬度，从而确定连接该基站的用户位置。

流量中同时包含 Diameter 协议（S6a 接口），主要用于 MME 与 HSS 之间的信令交互。在 Diameter 层中定位到 **EPS-Location-Information** AVP（AVP Code: 1496），展开后找到关键的 **E-UTRAN-Cell-Global-Identity**（AVP Code: 1602）：

```
AVP Code: 1496 EPS-Location-Information
  > AVP Flags: 0x80, Vendor-Specific: Set
  AVP Length: 80
  AVP Vendor Id: 3GPP (10415)
  EPS-Location-Information
      MME-Location-Information
          AVP Code: 1600 MME-Location-Information
          MME-Location-Information
              E-UTRAN-Cell-Global-Identity: 0ddb88fbbcca4f
                  AVP Code: 1602 E-UTRAN-Cell-Global-Identity
                  E-UTRAN-Cell-Global-Identity: 0ddb88fbbcca4f
              Tracking-Area-Identity: 64f08099f4
              Age-Of-Location-Information: 1
```

ECGI 值为 `0ddb88fbbcca4f`。

按照题目要求，对该值进行 32 位 MD5 哈希：

```bash
echo -n "0ddb88fbbcca4f" | md5sum
# 22226aba1d98c4302a6f508cad7da5d8
```

得到 flag。

---

## 题目二：冰蝎加密流量分析

### 题目描述

在一次网络安全的挑战中，截获了一段神秘的冰蝎流量，据说这段流量中隐藏着重要的信息。找出隐藏在流量中的秘密。

入手文件 `bx.pcapng`。

### 分析过程

#### 文件修复

用 Wireshark 或 scapy 尝试打开 pcapng 文件时发现报错，SHB（Section Header Block）的字节序魔数异常。用 010 Editor 查看文件头：

```
0000h: 0A 0D 0D 0A 70 00 00 00 4D 3C 4A 01 00 00 00 FF
```

正常的 pcapng 字节序魔数应为 `1A 2B 3C 4D`（大端），文件中存储为 `4D 3C 4A 01`。经比对，此处的 `4A 01` 为错误字节，应修正为 `2B 1A`：

```
0000h: 0A 0D 0D 0A 70 00 00 00 4D 3C 2B 1A 01 00 00 00
```

保存后即可正常解析。

#### 协议识别

修复后用 Wireshark 打开，过滤出 HTTP 流量。看到多个对 `/bx4.0/aes.php` 的 POST 请求，请求体为类 Base64 的长字符串。`bx4.0` 是冰蝎（Behinder）v4.0 版本的标志，`aes.php` 表示使用 AES 加密模式。

流量特征：
- 请求 URI：`/bx4.0/aes.php`
- Content-Type：`application/x-www-form-urlencoded`
- User-Agent：`Mozilla/5.0 (Windows NT 10.0) ... Chrome/84.0.4147.125`
- 通信目标：`127.0.0.1`

三个不同长度的请求体：
- 请求 1：3800 字节
- 请求 2：6380 字节
- 请求 3：4204 字节

#### 密钥爆破

冰蝎 v4.0 使用 AES-128-CBC 加密通信内容，密钥由密码通过 MD5 派生。使用冰蝎爆破工具尝试默认密码，成功找到密码为 `rebeyond`，派生 AES 密钥为 `e5e3529feb5d925b`。

解密后得到冰蝎与 WebShell 之间的 JSON 格式通信内容，包含命令执行结果等信息。

#### 获取 Flag

解密所有通信数据后，找到数据量最小的一条记录，其中的 `msg` 字段包含 Base64 编码的字符串。对该字符串进行 Base64 解码即可得到 flag。

> 本题参考了 NSSCTF 上相关 WP 的解题思路，在此表示感谢。

---

## 总结

两道题目覆盖了不同的流量分析方向：

1. **第一题**考察对移动通信核心网协议（S1AP / Diameter / GTPv2）的理解，关键是在大量的信令交互中找到承载用户位置信息的 ECGI 字段。Wireshark 的协议解析树是关键工具。

2. **第二题**是经典的 Webshell 加密流量分析，需要识别冰蝎的流量特征、修复损坏的 pcap 文件、爆破加密密钥，最后解密提取隐藏信息。

两道题做完，对蜂窝网络信令分析和 Webshell 流量取证都有了更深的理解。

---

> 作者：明久
