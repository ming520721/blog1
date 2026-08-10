---
title: 网鼎杯流量分析两道题WP
date: 2026-08-10
category: 安全
type: tech
description: 网鼎杯流量分析，两道题分别是 4G 核心网信令分析和冰蝎加密流量解密
image: /wangdingcup-cover.jpg
---

网鼎杯的两道流量分析题，一道是 4G 核心网信令分析，另一道是冰蝎 Webshell 加密流量解密。两道题都是关于"流量分析"这个方向的，但侧重点完全不同。第一道偏网络协议知识，第二道偏加解密逆向。

复现链接：

- 题目一（MME 流量分析）：https://www.nssctf.cn/problem/6959
- 题目二（冰蝎加密流量）：https://www.nssctf.cn/problem/6848

---

## 一些前置知识

在开始解题之前，先补充一些背景知识。这两道题涉及的知识面不太一样，分开来说。

### 4G LTE 核心网架构（EPC）

4G 的核心网叫做 EPC（Evolved Packet Core，演进分组核心网）。跟 3G 时代相比，4G 把电路域砍掉了，整个核心网全部走分组交换，所以叫"全 IP 网络"。

EPC 主要由下面几个网元组成：

| 网元 | 全称 | 功能 |
|------|------|------|
| **MME** | Mobility Management Entity | 移动性管理实体，负责信令处理、用户位置管理、鉴权、寻呼等。是整个 EPC 的控制面核心 |
| **S-GW** | Serving Gateway | 服务网关，负责数据包的路由和转发。一个 MME 下面可以管多个 S-GW |
| **P-GW** | PDN Gateway | PDN 网关，对外连接互联网。负责 IP 地址分配、策略执行、计费 |
| **HSS** | Home Subscriber Server | 归属用户服务器，存储用户签约信息（类似于 3G 的 HLR） |
| **eNB** | eNodeB | 4G 基站，跟 MME 通过 S1-MME 接口通信 |

这些网元之间使用不同的协议通信：

```
  UE（手机）
    |
    | 空口（LTE-Uu）
    |
  eNB（基站）
   / \
  /   \
S1-MME  S1-U
(S1AP  (GTP-U
over   over
SCTP)  UDP)
 /       \
MME      S-GW ──GTP-C── MME
 |        |
S6a       S5/S8
(Diameter)(GTP-C)
 |        |
HSS      P-GW ── 互联网
```

核心网三大控制面协议：

| 协议 | 接口 | 传输层 | 用途 |
|------|------|--------|------|
| **S1AP** | S1-MME | SCTP | eNB 与 MME 之间传递信令消息 |
| **GTPv2-C** | S11/S5 | UDP（2123 端口） | MME 与 S-GW 之间管理隧道 |
| **Diameter** | S6a | SCTP | MME 向 HSS 查询/更新用户信息 |

#### SCTP 协议简介

SCTP（Stream Control Transmission Protocol，流控制传输协议）是 4G 控制面的核心传输层协议，在 IP 协议号 132。可以把它理解为 TCP 的"增强版"——保留了 TCP 的可靠传输和拥塞控制，同时增加了：

- **多流（Multi-streaming）**：在一个连接里可以有多条逻辑流，不同的数据走不同的流，避免了 TCP 的队头阻塞问题
- **多宿主（Multi-homing）**：一个端点可以绑定多个 IP 地址，主路径断了自动切备路径

在电信网络中，SCTP 被用来承载 S1AP（基站 ↔ MME）和 Diameter（MME ↔ HSS）等高层协议。

#### Diameter 协议简介

Diameter 可以理解为 RADIUS 协议的升级版（名字也是个梗，半径的两倍是直径）。它运行在 SCTP 或 TCP 之上，使用 AVP（Attribute-Value Pair，属性值对）来承载数据。

Diameter 在 4G 核心网中扮演着关键角色。MME 通过 S6a 接口（使用 Diameter 协议）向 HSS 发送 Update Location Request（更新位置请求）时，会在 AVP 中携带用户的 ECGI（E-UTRAN 小区全局标识符），也就是用户的物理位置信息。

#### ECGI 是什么

**ECGI**（E-UTRAN Cell Global Identifier，E-UTRAN 小区全局标识符）是一个 52 位（bit）的标识符，用于在全球范围内唯一标识一个基站的特定扇区（小区）。它的结构如下：

```
ECGI (52 bits) = PLMN-ID (24 bits) + ECI (28 bits)

PLMN-ID = MCC (12 bits) + MNC (12 bits)
ECI = eNB-ID (20 bits) + Cell-ID (8 bits)
```

- **MCC**（Mobile Country Code）：移动国家码，460 = 中国
- **MNC**（Mobile Network Code）：移动网络码，00 = 中国移动，01 = 中国联通，11 = 中国电信
- **eNB-ID**：基站标识
- **Cell-ID**：扇区标识

有了 ECGI，通过公开的基站数据库（如 OpenCelliD、Mozilla Location Service 等）就可以查出该基站的经纬度，进而定位用户。

在本题中，ECGI 以 14 位十六进制数（56 bits，含 4 bits 填充）的形式出现在 Diameter 的 AVP 中。

---

### 冰蝎（Behinder）Webshell 管理工具

冰蝎是一个知名的 Webshell 管理工具，截至 2026 年最新版本为 v4.1。它的核心特点是使用**加密隧道**进行通信，规避传统 IDS/IPS 的检测。

#### 各版本加密方式对比

| 版本 | 加密方式 | 通信特征 |
|------|---------|----------|
| v1.x | 无加密（Base64 简单编码） | 容易被检测 |
| v2.x | AES-128-CBC + 动态密钥 | 引入加密 |
| v3.x | AES-128-CBC + 随机 IV | 增强安全性 |
| **v4.x** | **AES-128-CBC + 固定密钥（MD5 派生）** | 默认密钥 `rebeyond` |

#### 冰蝎 v4.0 加密流程

冰蝎 v4.0 的通信加密过程如下：

```
1. 用户输入连接密码（默认 "rebeyond"）
          ↓
2. MD5(密码) → 取前 16 字节作为 AES-128 密钥
          ↓
3. 要传输的 JSON 数据 + PKCS7 填充
          ↓
4. AES-128-CBC 加密（随机生成 16 字节 IV）
          ↓
5. IV + 密文 → Base64 编码
          ↓
6. 放入 HTTP POST Body 发送
```

服务端收到后逆向操作：
```
Base64 解码 → 取前 16 字节作为 IV → AES-128-CBC 解密 → 去填充 → 得到 JSON
```

#### AES-128-CBC 简介

AES（Advanced Encryption Standard）是目前最广泛使用的对称加密算法。几个关键参数：

- **密钥长度**：AES-128 使用 128 位（16 字节）密钥
- **分组长度**：固定 128 位（16 字节）
- **加密模式**：CBC（Cipher Block Chaining，密码块链接），每个明文块在加密前先与前一个密文块进行 XOR 运算
- **IV（初始化向量）**：CBC 模式需要 16 字节随机 IV，每次加密都不同
- **填充**：PKCS7 填充，将明文补齐到 16 字节（块大小）的整数倍

#### pcapng 文件格式

pcapng（PCAP Next Generation）是 Wireshark 的新一代抓包文件格式，用来替代旧的 pcap 格式。它的文件头结构如下：

```
Section Header Block (SHB) 结构:
┌──────────┬──────┬─────────────────────────────┐
│  偏移    │ 大小 │ 字段                        │
├──────────┼──────┼─────────────────────────────┤
│  0x00    │  4   │ Block Type: 0x0A0D0D0A      │
│  0x04    │  4   │ Block Total Length          │
│  0x08    │  4   │ Byte-Order Magic: 0x1A2B3C4D │
│          │      │ （大端机上是这个值）          │
│  0x0C    │  2   │ Major Version               │
│  0x0E    │  2   │ Minor Version               │
│  0x10    │  8   │ Section Length              │
│  0x18    │  N   │ Options（可变）              │
│  0x18+N  │  4   │ Block Total Length（重复）   │
└──────────┴──────┴─────────────────────────────┘
```

关键字段是 0x08 处的 **Byte-Order Magic**：
- 如果是 `1A 2B 3C 4D`，表示文件是大端序（Big-Endian）写入的
- 如果是 `4D 3C 2B 1A`，表示文件是小端序（Little-Endian）写入的
- **0x04 和 0x08 处的 Block Total Length 必须相等**，Wireshark 会校验这个

如果这个魔数字段损坏了（比如本题），Wireshark 就无法识别文件格式。

#### Base64 编码原理

Base64 是一种用 64 个可打印字符（A-Z、a-z、0-9、+、/）来表示任意二进制数据的编码方式。每 3 个字节（24 bits）被分为 4 组每组 6 bits，每组对应一个字符。

在冰蝎中，加密后的二进制数据（IV + 密文）会先进行 Base64 编码，然后作为 HTTP 请求体发送。解码是解密的第一步。

---

## 题目一：网鼎杯 MME 流量分析

复现链接：https://www.nssctf.cn/problem/6959

### 题目描述

> 某单位网络遭到非法的攻击，安全人员对流量调查取证之后保存了关键证据，发现人员的定位信息存在泄露，请对其进行分析。flag 为用户位置信息进行 32 位 MD5 哈希值。

到手一个 `MME.cap`，大小约 48KB，包含 141 个数据包。

### Step 1：初步分析流量包

拿到 pcap 文件第一步，先用 Wireshark 打开，然后看 **Statistics（统计）→ Protocol Hierarchy（协议层级）**，了解流量包的协议分布：

```
Protocol          Packets   Percent
SCTP              119       84.4%
  S1AP            90        63.8%
  Diameter        29        20.6%
UDP               22        15.6%
  GTPv2           22        15.6%
```

可以看出三大类流量：
- **SCTP 承载 S1AP**：eNB（基站）和 MME 之间的控制面信令，收发双方为 `1.1.1.1` 和 `2.2.2.2`
- **SCTP 承载 Diameter**：MME 和 HSS 之间的用户信息查询，同样是 `1.1.1.1` 和 `2.2.2.2`
- **UDP 2123 端口承载 GTPv2-C**：MME 和 S-GW 之间的 GTP 隧道管理，`14.66.12.4` 和 `14.66.50.4`

有了这张表，可以确定这是一个 **4G LTE 核心网（EPC）** 的信令流量包。

> Wireshark 小技巧：`Statistics → Protocol Hierarchy` 是最常用的分析入口，可以一目了然地看到数据包中都有哪些协议，以及每种协议的数量和占比。

进一步看 S1AP 的明文内容，可以在 SCTP 的 Payload 中看到这样的字符串：

```
mmec60.mmegi0361.mme.epc.mnc008.mcc460.3gppnetwork.org
```

可以拆解出 PLMN 信息：

| 字段 | 值 | 含义 |
|------|-----|------|
| MCC | 460 | 移动国家码，460 = 中国 |
| MNC | 008 | 移动网络码，008 = 中国移动 |
| MMEGI | 0361 | MME 组标识 |
| MMEC | 60 | MME 码 |

这意味着这个流量包是中国移动的 4G 核心网信令。

### Step 2：定位用户位置信息

题目说要找"人员的定位信息"。在 4G 核心网中，有几个地方会携带用户位置信息：

1. **S1AP 层** — `InitialUEMessage` 消息中的 `EUTRAN_CGI` 字段
2. **GTPv2-C 层** — `Create Session Request` 消息中的 `ULI`（User Location Information，用户位置信息）
3. **Diameter 层** — `Update-Location-Request (ULR)` 中的 `EPS-Location-Information` AVP

三条路都可以走，但最清晰的是 **Diameter 层**，因为它把完整的位置信息封装在标准 AVP 结构中。

在 Wireshark 过滤栏输入 `diameter` 过滤出所有 Diameter 流量。或者直接用 `diameter.avp.code == 1602` 过滤到最关键的那个 AVP。

在任意一个 Diameter 包中，找到 `AVP: EPS-Location-Information (1496)`，展开后可以看到：

```
AVP Code: 1496 EPS-Location-Information
  AVP Flags: 0x80, Vendor-Specific: Set
  AVP Length: 80
  AVP Vendor Id: 3GPP (10415)
  EPS-Location-Information
      MME-Location-Information
          AVP Code: 1600 MME-Location-Information
          AVP Length: 68
          AVP Vendor Id: 3GPP (10415)
          MME-Location-Information
              E-UTRAN-Cell-Global-Identity: 0ddb88fbbcca4f
                  AVP Code: 1602 E-UTRAN-Cell-Global-Identity
                  AVP Flags: 0x80, Vendor-Specific: Set
                  AVP Length: 19
                  AVP Vendor Id: 3GPP (10415)
                  E-UTRAN-Cell-Global-Identity: 0ddb88fbbcca4f
                  Padding: 00
              Tracking-Area-Identity: 64f08099f4
              Age-Of-Location-Information: 1
```

关键字段逐一拆解：

| AVP Code | 名称 | 值 | 含义 |
|----------|------|-----|------|
| 1496 | EPS-Location-Information | - | 封装 EPS 位置信息 |
| 1600 | MME-Location-Information | - | 封装 MME 级位置信息 |
| **1602** | **E-UTRAN-Cell-Global-Identity** | **0ddb88fbbcca4f** | **ECGI，全球唯一基站扇区标识** |
| - | Tracking-Area-Identity | 64f08099f4 | TAI（跟踪区标识） |
| - | Age-Of-Location-Information | 1 | 位置信息已过去 1 分钟 |

ECGI 值就是 `0ddb88fbbcca4f`。

其中 TAI `64f08099f4` 可以进一步解析：
```
TAI = TAC (2 bytes) + PLMN Identity (3 bytes)
64f0 = TAC (Tracking Area Code) = 25840
80 99 f4 → 解析 PLMN: MCC=460, MNC=099
```

但本题只需要 ECGI，不需要关心 TAI 的还原。

> 在 Wireshark 中，你可以右键点击任意 AVP 字段 → `Copy → Value` 直接复制字段值，也可以用 `Apply as Filter → Selected` 过滤所有包含相同 AVP 的数据包，非常好用。

### Step 3：计算 Flag

题目要求"flag 为用户位置信息进行 32 位 MD5 哈希值"，也就是对 ECGI 值 `0ddb88fbbcca4f` 进行 MD5 哈希。

Windows 系统上可以通过以下方式计算（PowerShell）：

```powershell
# PowerShell 方式
$hash = [System.Security.Cryptography.MD5]::Create()
$bytes = [System.Text.Encoding]::UTF8.GetBytes("0ddb88fbbcca4f")
$hashBytes = $hash.ComputeHash($bytes)
$hashString = -join ($hashBytes | ForEach-Object { $_.ToString("x2") })
Write-Output $hashString
```

Linux / macOS / WSL 上：

```bash
echo -n "0ddb88fbbcca4f" | md5sum
# 或
echo -n "0ddb88fbbcca4f" | openssl md5
```

结果：

```
22226aba1d98c4302a6f508cad7da5d8
```

这就是最终的 flag。

> 注意：`echo -n` 的 `-n` 参数很关键，它确保不会在字符串末尾自动添加换行符。如果不加 `-n`，相当于对 `0ddb88fbbcca4f\n` 进行 MD5，结果会完全不一样。

---

## 题目二：冰蝎加密流量分析

复现链接：https://www.nssctf.cn/problem/6848

### 题目描述

> 在一次网络安全的挑战中，你截获了一段神秘的冰蝎流量。据说这段流量中隐藏着重要的信息。你能解开这个谜团，找出隐藏在流量中的秘密吗？

到手一个 `bx.pcapng`，大小约 60KB。

### Step 1：修复损坏的 pcapng 文件

用 Wireshark 直接打开 `bx.pcapng`，发现报错：

```
The file "bx.pcapng" appears to be damaged or corrupt
```

Wireshark 打不开，说明文件头有问题。遇到这种情况最常用的做法是用十六进制编辑器检查文件头。

这里用的是 **010 Editor**，一款强大的十六进制编辑软件（也可以用免费的 HxD 或 Hex Fiend）。

打开 `bx.pcapng`，首先看到的是文件的前 16 个字节：

```
0000h: 0A 0D 0D 0A 70 00 00 00 4D 3C 4A 01 00 00 00 FF
0010h: FF FF FF FF FF FF FF FF 4C 00 00 31 74 46 88 20
```

逐个字段对照 pcapng 的 Section Header Block 结构：

| 偏移 | 实际值 | 期望值 | 判断 |
|------|--------|--------|------|
| 0x00 (Block Type) | `0A 0D 0D 0A` | `0A 0D 0D 0A` | ✅ 正确 |
| 0x04 (Block Length) | `70 00 00 00` | 0x00000070 = 112 | ✅ 合理 |
| 0x08 (Byte-Order Magic) | `4D 3C 4A 01` | `4D 3C 2B 1A`（小端）| ❌ 错误！ |

0x08 位置的字节序魔数应该是小端序 `4D 3C 2B 1A`（大端序机器则是 `1A 2B 3C 4D`），但实际值是 `4D 3C 4A 01`，其中 `4A 01` 这个字段被损坏了。

修复方法：将 `4A 01` 改为 `2B 1A`。在 010 Editor 中，直接在十六进制视图点击对应字节进行编辑。

修改后的文件头：

```
0000h: 0A 0D 0D 0A 70 00 00 00 4D 3C 2B 1A 01 00 00 00
```

保存为 `bx_fix.pcapng`，再用 Wireshark 打开，正常识别。

> 小技巧：如果你不确定怎么修复，可以找一个正常的 pcapng 文件对比前 16 个字节。或者直接去看 Wireshark 的 pcapng 规范文档：[PCAP Next Generation Dump File Format](https://www.ietf.org/staging/draft-ietf-opsawg-pcap-00.html)

### Step 2：识别冰蝎流量

用 Wireshark 打开修复后的 `bx_fix.pcapng`，过滤器输入 `http`，看到多个 HTTP POST 请求。展开其中一个：

```
POST /bx4.0/aes.php HTTP/1.1
Host: 127.0.0.1
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...
Content-Type: application/x-www-form-urlencoded
Content-Length: 3800

m7nCS8n4OZG9akdDlxm6OdJevs/jYQ5/IcXK/BRdpcFv7f8imFFv...
```

从请求路径直接识别出几个关键信息：

| 特征 | 含义 |
|------|------|
| `/bx4.0/` | **bx** = Behinder（冰蝎），**4.0** = 版本 4.0 |
| `aes.php` | 使用 AES 加密的 PHP Webshell |
| `127.0.0.1` | 本机通信，说明攻击者在本机环境做测试 |
| POST Body 为 Base64 | 冰蝎典型的加密传输特征 |

统计一下整个流量中的所有 HTTP 请求：

在 Wireshark 中，`Statistics → HTTP → Requests` 可以看到所有请求列表。或者用 tshark 命令行导出：

```bash
tshark -r bx_fix.pcapng -Y "http.request" -T fields \
  -e http.request.method \
  -e http.request.uri \
  -e http.content_length
```

去重后有三组不同长度的 POST Body：

| 编号 | Content-Length | 说明 |
|------|---------------|------|
| 1 | 3800 | 较短的请求 |
| 2 | 6380 | 较长的请求 |
| 3 | 4204 | 中等长度 |

这些全都是 Base64 编码的 AES 密文，需要破解冰蝎的加密密钥才能解密。

### Step 3：爆破冰蝎密钥

冰蝎 v4.0 使用 AES-128-CBC 加密，密钥由密码通过 MD5 派生（取前 16 字节）。大多数使用者不会改默认密码，所以可以用默认密码字典进行爆破。

使用冰蝎专用的流量解密工具（如 [CTF-NetA](https://github.com/Arinue/CTF-NetA) 或冰蝎自带工具）：

```
密钥派生流程：
密码 "rebeyond" → MD5("rebeyond") → e5e3529feb5d925b...（取前16字节）

所以 AES 密钥 = e5e3529feb5d925b
         IV = 密文 Base64 解码后的前 16 字节
  实际密文 = IV 之后的部分
```

爆破很快就得到结果：

```
[2026-03-25 18:30:09] 开始爆破，线程数: 24
Find Password: rebeyond
AES key: e5e3529feb5d925b
Message:
{"status":1,"msg":"..."}
[2026-03-25 18:30:10] 爆破完成!
```

> 冰蝎各版本的默认密码：
> - v2.x：`rebeyond` → AES Key 为 MD5(password) 取前 16 位
> - v3.x：`rebeyond` → AES Key 为 MD5(password) 取前 16 位，IV 随机
> - v4.x：`rebeyond` → AES Key 为 MD5(password) 取前 16 位，IV 随机
>
> 几乎没有人会在实际使用时修改默认密码...

用解密工具把全部流量解密后，得到 JSON 格式的通信内容：

```json
{
  "status": 1,
  "msg": "base64编码的数据..."
}
```

其中 `msg` 字段内的 Base64 数据是冰蝎传输的实际内容（Shell 命令和回显）。

### Step 4：提取 Flag

解密所有请求和响应后，按数据包大小（或 msg 字段长度）排序。数据量最少的那一条请求，其 msg 字段解码后就是 flag。

如果手动操作，流程如下：

1. 先用工具将所有 HTTP 请求的 Body 字段提取出来
2. 对每个 Body 用密钥 `e5e3529feb5d925b` 进行 AES-128-CBC 解密（IV 取前 16 字节）
3. 解密后得到 JSON，提取 `msg` 字段，再进行一次 Base64 解码
4. 对每个解码后的 msg 按长度排序，最特殊（最短或最长）的那个就是 flag

最终 flag 的格式类似：`flag{xxxxxx}` 或一串特殊字符串。

> 在做解密操作时，如果无法直接使用图形化工具，用 Python 脚本也很方便：
>
> ```python
> from Crypto.Cipher import AES
> import base64, hashlib
> 
> password = "rebeyond"
> key = hashlib.md5(password.encode()).digest()[:16]
> 
> # 对每一段密文
> ciphertext = base64.b64decode(payload)
> iv = ciphertext[:16]
> data = ciphertext[16:]
> cipher = AES.new(key, AES.MODE_CBC, iv=iv)
> plain = cipher.decrypt(data)
> # 去掉 PKCS7 填充
> pad_len = plain[-1]
> result = plain[:-pad_len]
> ```

---

## 总结

两道题练下来，对流量分析这个方向有了更具体的认识。

**题目一**的难点在于知识门槛——如果不知道 4G 核心网的架构和 ECGI 的概念，打开 pcap 文件看到 SCTP、Diameter、GTPv2 这些协议时真的是一脸懵。但一旦知道了"用户位置信息藏在 Diameter 的 EPS-Location-Information AVP 里"这层关系，定位 flag 就是几分钟的事。这道题本质上考的是**对电信网络协议栈的认知**。

**题目二**相对更贴近常规 CTF 套路——修文件头 → 识别特征 → 爆破密钥 → 解密提取。每个步骤单独拿出来都不算特别难，但组合起来需要有一定的耐心和工具链积累。关键点有两个：一是 pcapng 文件头的字节序魔数（0x08 处的 `1A 2B 3C 4D`）；二是冰蝎 v4.0 的默认密码 `rebeyond` 和 AES-128-CBC 加密模式。

流量分析这个方向，经验积累很重要。见得多了，下次再遇到类似的题就能快速定位关键字段，不会像第一次这样到处乱翻。

---

> 作者：明久
