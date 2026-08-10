---
title: 网鼎杯流量分析两道题WP
date: 2026-08-10
category: 安全
type: tech
description: 网鼎杯流量分析，两道题分别是 4G 核心网信令分析和冰蝎加密流量解密
image: /wangdingcup-cover.jpg
---

网鼎杯第五周布置的两道流量分析题，一道是 4G 核心网信令分析，另一道是冰蝎 Webshell 加密流量解密。做第一道的时候完全没头绪，去查了查资料才搞明白这玩意儿是啥（

---

## 一些前置知识

在开始之前，先补充一点可能需要了解的背景知识，方便后面理解。

### 4G LTE 核心网架构

4G 核心网（EPC，演进分组核心网）由几个关键网元组成：

| 网元 | 全称 | 作用 |
|------|------|------|
| MME | Mobility Management Entity | 移动性管理，处理用户位置更新、鉴权等 |
| S-GW | Serving Gateway | 服务网关，路由用户数据 |
| P-GW | PDN Gateway | PDN 网关，连接外网 |
| HSS | Home Subscriber Server | 归属用户服务器，存储用户签约信息 |
| eNB | eNodeB | 4G 基站 |

核心网中几大通信协议：

| 协议 | 接口 | 传输层 | 用途 |
|------|------|--------|------|
| S1AP | S1-MME | SCTP | eNB 与 MME 之间的控制面信令 |
| GTPv2-C | S11/S5 | UDP(2123) | MME 与 S-GW 之间的隧道管理 |
| Diameter | S6a | SCTP | MME 与 HSS 之间的用户信息查询 |

### 冰蝎 Behinder

冰蝎（Behinder）是一款常见的 Webshell 管理工具，最新版本 v4.0 使用 AES 加密通信流量。它的特征是：
- 请求 URL 通常包含 `/bx4.0/aes.php` 或类似路径
- 通信内容经过 AES-128-CBC 加密后，再进行 Base64 编码
- 默认连接密码为 `rebeyond`，密钥通过 MD5 派生
- 需要爆破或已知密码才能解密流量内容

---

## 题目一：网鼎杯 MME 流量分析

### 题目描述

> 某单位网络遭到非法的攻击，安全人员对流量调查取证之后保存了关键证据，发现人员的定位信息存在泄露，请对其进行分析。flag 为用户位置信息进行 32 位 MD5 哈希值。

到手一个 `MME.cap`，共 141 个数据包。

### Q1：识别流量中的协议类型

用 Wireshark 打开，一眼看到大量的 SCTP 和 GTPv2 流量。统计一下协议分布：

- SCTP 协议（132 协议号）：119 个包，通信双方 `1.1.1.1` ↔ `2.2.2.2`
- UDP 协议：22 个包，通信双方 `14.66.12.4` ↔ `14.66.50.4`（端口 2123）

SCTP 承载的是 **S1AP** 信令（eNB 和 MME 之间的控制面），UDP 端口 2123 是 **GTP-C**（GPRS 隧道协议控制面）。这些组合明确告诉我们：这是一个 **4G LTE EPC 核心网**的流量包。

再往下翻，还能看到 **Diameter** 协议（S6a 接口，用于 MME 和 HSS 之间的通信）。

从 SCTP 的 S1AP 消息中能看到一些可读的明文字符串：

```
mmec60.mmegi0361.mme.epc.mnc008.mcc460.3gppnetwork.org
```

拆解一下这个字符串：

| 字段 | 值 | 含义 |
|------|-----|------|
| MCC | 460 | 移动国家码，460 = 中国 |
| MNC | 008 | 移动网络码，008 = 中国移动 |
| MMEGI | 0361 | MME 组标识 |
| MMEC | 60 | MME 码 |

### Q2：找到用户的位置信息

题目说要找"人员的定位信息"。在 4G 网络的信令中，用户位置通过 **ECGI（E-UTRAN 小区全局标识符）** 来标识。ECGI 在全球范围内唯一标识一个基站的特定扇区，通过基站数据库就能查出该基站的经纬度，也就确定了连接该基站的用户的位置。

所以我们需要在这个流量包里找到 ECGI 的值。

ECGI 在多个协议层都会出现：
- **S1AP** 的 Initial UE Message 中包含 TAI（跟踪区标识）和 E-UTRAN CGI
- **GTPv2-C** 的 Create Session Request 中包含 ULI（用户位置信息）
- **Diameter** 的 Update Location Request 中包含 EPS-Location-Information

这里最清晰的是 **Diameter 层的 EPS-Location-Information** AVP。

在 Wireshark 中过滤 Diameter 协议，展开找到 AVP Code 1496（EPS-Location-Information），再一层层展开到 AVP Code 1602（E-UTRAN-Cell-Global-Identity）：

```
AVP Code: 1496 EPS-Location-Information
  > AVP Flags: 0x80, Vendor-Specific: Set
  AVP Length: 80
  AVP Vendor Id: 3GPP (10415)
  EPS-Location-Information
      MME-Location-Information
          AVP Code: 1600 MME-Location-Information
          AVP Length: 68
          MME-Location-Information
              E-UTRAN-Cell-Global-Identity: 0ddb88fbbcca4f
                  AVP Code: 1602 E-UTRAN-Cell-Global-Identity
                  E-UTRAN-Cell-Global-Identity: 0ddb88fbbcca4f
              Tracking-Area-Identity: 64f08099f4
              Age-Of-Location-Information: 1
```

ECGI 值就是 `0ddb88fbbcca4f`。同时也能看到 TAI 为 `64f08099f4`，拆开就是 TAC=0x64f0（25840）加上 PLMN 信息。

### Q3：计算 Flag

题目要求对这个位置信息进行 32 位 MD5 哈希：

```bash
echo -n "0ddb88fbbcca4f" | md5sum
# 22226aba1d98c4302a6f508cad7da5d8
```

得到 flag。

> 第一次接触蜂窝网络信令分析，一开始完全找不到方向，绕了一圈才发现关键在 Diameter 层的 ECGI 字段。

---

## 题目二：冰蝎加密流量分析

### 题目描述

> 在一次网络安全的挑战中，你截获了一段神秘的冰蝎流量。据说这段流量中隐藏着重要的信息。你能解开这个谜团，找出隐藏在流量中的秘密吗？

到手一个 `bx.pcapng`。

### Q1：修复损坏的 pcapng 文件

用 Wireshark 打开时直接报错，用 010 Editor 看十六进制：

```
0000h: 0A 0D 0D 0A 70 00 00 00 4D 3C 4A 01 00 00 00 FF
```

pcapng 文件的 Section Header Block 结构：

| 偏移 | 大小 | 字段 | 正常值 |
|------|------|------|--------|
| 0x00 | 4 | Block Type | 0A 0D 0D 0A |
| 0x04 | 4 | Block Length | 可变 |
| 0x08 | 4 | Byte-Order Magic | 1A 2B 3C 4D（大端） |

文件中 0x08 处的字节序魔数为 `4D 3C 4A 01`，其中 `4A 01` 是损坏的部分，应该是 `2B 1A`。更正后：

```
0000h: 0A 0D 0D 0A 70 00 00 00 4D 3C 2B 1A 01 00 00 00
```

保存为 `bx_fix.pcapng`，Wireshark 正常打开。

### Q2：识别冰蝎流量

过滤 HTTP 协议，看到几个 POST 请求：

```
POST /bx4.0/aes.php HTTP/1.1
Host: 127.0.0.1
Content-type: application/x-www-form-urlencoded
User-Agent: Mozilla/5.0 (Windows NT 10.0) ... Chrome/84.0.4147.125
Content-Length: 3800
```

请求路径 `/bx4.0/aes.php` 暴露了身份——**bx** 就是冰蝎，**4.0** 是版本号，**aes.php** 表示使用 AES 加密传输。

抓到的请求体都是长这样的 Base64 密文（截取前几十个字符）：

```
m7nCS8n4OZG9akdDlxm6OdJevs/jYQ5/IcXK/BRdpcFv7f8imFFv...
```

一共有三组不同长度的 POST 请求（去重后）：

| 编号 | Content-Length | 
|------|---------------|
| 1 | 3800 |
| 2 | 6380 |
| 3 | 4204 |

### Q3：爆破加密密钥

冰蝎 v4.0 的加密方案是：

1. 客户端用密码 → MD5 → 取前 16 字符作为 AES 密钥
2. JSON 数据 → AES-128-CBC 加密（随机 IV）
3. IV + 密文 → Base64 编码 → HTTP POST Body

所以解密需要知道密码。直接拿冰蝎爆破工具跑默认密码字典，很快就命中：

```
Find Password: rebeyond
AES key: e5e3529feb5d925b
```

冰蝎的默认密码就是 `rebeyond`，大部分人不会改（

解密后的通信内容是 JSON 格式，包含了冰蝎与 WebShell 之间的命令交互、执行结果等。

### Q4：找到 Flag

解密完所有请求和响应的数据后，按数据量从小到大排序，数据量最少的那一条请求中提取出如下 Base64 数据：

```
mAUYLzmqn5SQPDkyI51vSp6DmrC24FW39Y4Ys3hUqS7Y9kjdZmEMYmOeeAOK3Jrwc
ArYL/0aeFzYpI0VfNPDOj3+ASwFs23uydZCBSuDZ451F9P0uIdVS/prgGsObPkze
```

对该数据进行 AES 解密后，即可得到最终的 flag。

> 冰蝎解密工具可以在 [CTF-NetA](https://github.com/Arinue/CTF-NetA) 下载，配合默认密码爆破即可快速解密。

---

## 总结

两道题目练下来，感觉流量分析这个方向最考验的是两点：一是**对网络协议的熟悉程度**，二是**耐心**。

第一题如果不知道 4G 核心网的协议栈和 ECGI 的概念，拿到 pcap 文件真的是一脸懵。但一旦知道了 Diameter AVP 1602 这个关键字段，定位 flag 就是几秒钟的事。

第二题的冰蝎加密流量相对来说更"常规"一些，修文件头→识别特征→爆破密钥→解密提取，套路比较固定。但文件头的修复这一步如果没有经验，可能也会卡很久。

两道题做下来收获不少，对流量分析这个方向也有了更深的理解。

---

> 作者：明久
