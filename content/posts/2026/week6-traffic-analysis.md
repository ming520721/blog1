---
title: 流量分析两道题WP
date: 2026-08-14
category: 安全
type: tech
description: 第六周考核两道流量分析题：IP 标识字段隐写，以及 DNS 数据外带还原加密压缩包再破解 QR 码掩码
image: /week6-traffic-cover.jpg
---

这周考核的两道流量分析题，都藏在 pcap 文件里，但思路完全不同。第一道是 IP 头 `Identification` 字段的隐写，靠的是对协议字段的理解；第二道是一条完整的攻击链——DNS 数据外带、加密压缩包、二维码掩码，一环扣一环，挺有意思。

复现链接：

- 题目一（IP 标识字段隐写）：https://www.nssctf.cn/problem/7482
- 题目二（DNS 数据外带）：https://www.nssctf.cn/problem/7174

---

## 题目一：IP 标识字段隐写

### 前置知识：IP 头的 Identification 字段

IP 报文头部有一个 16 位的 **Identification（标识）** 字段，占两个字节，取值范围 `0x0000 ~ 0xFFFF`。

它最初的设计用途是**分片重组**：同一个数据报被分片后，所有分片携带相同的 ID，接收方靠它把分片重新拼起来。但现在网络里的分片越来越少，这个字段大部分时候都是闲置的，于是就成了 CTF 里藏数据的好地方。

所谓"低字节"，就是这 16 位的低 8 位，也就是 `ip.id & 0xFF`，在十六进制表示下就是**末两位**。比如 `ip.id = 0x0969`，低字节就是 `0x69`，对应的 ASCII 字符是 `i`。把每个包的低字节当成一个字符，连续拼起来就是明文。

### 解题过程

题目说得很直白：在 `192.168.50.10 → 192.168.0.50` 的 ICMP 流里，连续 35 个包可以提取出十六进制字符串。

先用 Wireshark 过滤器定位这条流：

```
ip.src == 192.168.50.10 && ip.dst == 192.168.0.50 && icmp
```

正好 35 个包。然后提取每个包的 `ip.id` 低字节。用 tshark 最方便：

```bash
tshark -r PrivateChannel.pcap.pcapng \
  -Y "ip.src==192.168.50.10 && ip.dst==192.168.0.50 && icmp.type==8" \
  -T fields -e ip.id \
  | sed 's/0x//' \
  | awk '{print substr($0, length($0)-1)}' \
  | paste -sd '' -
```

也可以直接用 Python + Scapy：

```python
from scapy.all import rdpcap

pkts = rdpcap('PrivateChannel.pcap.pcapng')
sel = [p for p in pkts
       if p.haslayer('IP') and p.haslayer('ICMP')
       and p['IP'].src == '192.168.50.10'
       and p['IP'].dst == '192.168.0.50'
       and p['ICMP'].type == 8]

low = [p['IP'].id & 0xff for p in sel]
print(bytes(low))
```

跑出来结果是：

```
hex  : 000069226865726520697320796f7572...
```

前两个包的 `ip.id = 0x0000` 是填充，第 3 个包是混进来的 echo-reply（`ICMP type=0`）干扰包。去掉这些干扰，把剩下的低字节拼起来就是题目要的明文。

这道题本身不难，但它提醒了一点：**流量隐写不一定藏在 payload 里，协议头部那些"看起来没用"的字段一样可以藏数据**。除了 `ip.id`，常见的还有 `tcp.urgent_pointer`、`tcp.seq/ack`、`dns.qry.name` 这些。

---

## 题目二：DNS 外带 + 加密压缩包 + QR 掩码

这道题完整走了一遍攻击链，信息量比第一道大得多。题目描述说"某内网主机被怀疑通过 DNS 流量悄悄送出了一份文件"，要我们还原被外带的数据并找到里面的机密信息。

### 整体思路

分三步：

1. 从 pcap 里把 DNS 外带的数据拼回来，还原出一个**加密的 zip**；
2. 破解 ZipCrypto 加密，解压出一张二维码图片和一份 QR 标准 PDF；
3. 二维码被额外的 Mask 3 扰乱，按 `(i+j)%3==0` 对数据模块做异或恢复，解码出结果。

下面逐步拆解。

### Step 1：DNS 数据外带还原

#### 什么是 DNS 数据外带

DNS 协议几乎是内网主机必然能用的出站通道——出站 DNS 查询通常不被防火墙拦截。攻击者利用这一点，把数据编码进 DNS 查询的**域名（qname）**里发出去。典型做法是把文件切成小段，每段转成十六进制，作为子域名拼在受控域名前面：

```
<hex数据>.attacker.com
```

本题的 qname 形如 `<hex>.google.`，伪装成 google 域名，数据就藏在最左边那个 label 里。

#### 定位外带通道（关键，做错会导致还原失败）

先统计 DNS 请求的方向。发现请求只发往三个目的地：

| 源 | 目的 | 数量 | 含义 |
|----|------|------|------|
| 192.168.33.167 | **8.8.8.8** | 203625 | ✅ 真正的数据外带通道 |
| 192.168.33.167 | 192.168.33.1 | 471 | 网关 DNS（干扰） |
| 127.0.0.1 | 127.0.0.53 | 427 | 本地 systemd-resolved（干扰） |

**为什么必须过滤 `ip.addr == 8.8.8.8`？** 这是这道题最大的坑。

发往 8.8.8.8 的查询，qname 是 `<hex>.google.`（以 `.google.` 结尾）；而发往本地 DNS 的查询，qname 是 `<hex>.google.com`（以 `.google.com` 结尾）。两套查询的 hex 前缀相同，但**是两套独立的查询流**。

如果不过滤 IP，把 `.google.` 和 `.google.com` 混在一起按包顺序拼接，就会把同一段数据重复插进来、或顺序错位。我一开始就踩了这个坑——还原出的 zip 文件表能读出来，但 deflate 数据解压直接报 `invalid distance too far back`。

正确的过滤器：

```
dns.flags.response == 0 && ip.dst == 8.8.8.8 && dns.qry.name contains "google"
```

即只取发往 8.8.8.8 的、qname 以 `.google.` 结尾的请求，取第一个 label 的 hex 拼接。

#### 提取并还原

从 pcap 里提取出 **203610 个 hex 片段**，拼接后得到 **6108269 字节** 的文件，头四个字节是 `50 4b 03 04`（`PK\x03\x04`），确认是 ZIP。

> **小知识点：pcapng 格式与 SLL 链路层**
> 附件虽然是 `.pcap` 后缀，但魔数是 `0a0d0d0a`，实际是 **pcapng** 格式。解析时要处理 Section Header Block、Interface Description Block、Enhanced Packet Block 三种 block。
> 其中 IDB 里的 linktype = **113**，是 Linux cooked capture（SLL），IP 头前面是 16 字节的 SLL 头（而不是以太网的 14 字节）。这就是脚本里 `ip_off = 16` 的由来。

### Step 2：破解 ZipCrypto 加密

#### ZIP 传统加密原理

ZIP 的加密标志在文件头的 flags 字段，bit0 表示加密。本题两个文件的 flags 都是 `0x0009`：

```
0x0001 = encrypted（加密）
0x0008 = data descriptor（数据描述符）
```

ZipCrypto 是一个**基于 CRC32 的流密码**，不是 AES。密钥调度是这样的：

```python
key0, key1, key2 = 0x12345678, 0x23456789, 0x34567890
for c in password:
    key0 = crc32(key0, c)
    key1 = (key1 + (key0 & 0xFF)) * 134775813 + 1
    key2 = crc32(key2, key1 >> 24)
```

加密数据 = **12 字节加密头 + 压缩数据（deflate）**。加密头前 11 字节是随机数，**第 12 字节是 check byte（校验字节）**，用来快速验证密码对不对。

**坑点在于 check byte 的取值规则：**

- 如果 flags 的 bit3 **未设置**：check byte = CRC32 的**最高字节**；
- 如果 flags 的 bit3 **已设置**（有 data descriptor）：check byte = **修改时间（mod time）的最高字节**。

本题 bit3 置位了，所以校验时要用 mod time 高位，而不是 CRC 高位。用错规则会误判成"密码错误"。

#### 解密

密码是 `XUt59@wG`。解密后去掉 12 字节加密头，剩下的是 raw deflate 流，用 `zlib.decompress(data, -15)`（`-15` 表示 raw deflate，无 zlib 头）解压，得到两个文件：

| 文件名 | 大小 | 类型 |
|--------|------|------|
| `3号面具.png` | 53174 字节 | PNG 图片 |
| `ISO_IEC18004-2015.pdf` | 6346542 字节 | QR 码国际标准文档 |

文件名 `3号面具` 的 GBK 编码是 `3\xba\xc5\xc3\xe6\xbe\xdf`，"面具" = mask，**"3号"就暗示了 Mask pattern 3**。

### Step 3：QR 码 Mask 隐写解码

#### 解压结果分析

两个文件其实都在给提示：

- `3号面具.png`：1080×1080 的图片，实际是一张二维码，但被"面具"（mask）扰乱了。
- `ISO_IEC18004-2015.pdf`：**QR 码的国际标准**，里面定义了 8 种 mask pattern 的公式。出题人放这份文档，就是让你去查 mask 的定义。

PNG 里还藏了一个非标准 chunk `fdEC`（5 字节 payload），也是提示线索。

#### QR 码结构基础

QR 码由两类模块组成：

- **功能图形（function patterns）**：定位、校正、格式信息，帮解码器找到并理解二维码，**不参与数据 mask**。
  - **Finder pattern（定位图案）**：三个角上的 7×7 同心方块，黑白比例 1:1:3:1:1，用来定位。
  - **Timing pattern（时序图案）**：第 6 行/第 6 列的交替黑白线，用来确定模块大小。
  - **Alignment pattern（校正图案）**：version ≥2 出现，帮助校正扭曲。
  - **Format info（格式信息）**：15 位，编码纠错级别和 mask 编号，带 BCH 纠错。
- **数据模块（data modules）**：真正承载内容的模块，**会被 mask 处理**。

本题二维码是 **version 5 = 37×37 模块**。从 finder pattern 的 1:1:3:1:1 比例（24:24:72:24:24 像素）可算出**模块大小 = 24 像素**，1080÷24 = 45 模块 = 4（静区）+ 37（二维码）+ 4（静区）。

#### Mask Pattern 原理（核心）

QR 码编码时，为了防止出现大片同色区域影响识别，会用一种 **mask（掩码）** 对数据模块做异或，让黑白分布更均匀。标准定义了 **8 种 mask**，公式如下（`i` 行、`j` 列，从 0 起）：

| Mask | 条件（满足则反转） |
|------|-------------------|
| 0 | `(i + j) % 2 == 0` |
| 1 | `i % 2 == 0` |
| 2 | `j % 3 == 0` |
| **3** | **`(i + j) % 3 == 0`** |
| 4 | `(i//2 + j//3) % 2 == 0` |
| 5 | `(i*j) % 2 + (i*j) % 3 == 0` |
| 6 | `((i*j) % 2 + (i*j) % 3) % 2 == 0` |
| 7 | `((i+j) % 2 + (i*j) % 3) % 2 == 0` |

这道题有两层坑：

1. 读 format info 得到 `0x662f`，BCH 解码后是 **EC=L，mask=4**——这是**原始**二维码编码时用的 mask。
2. 但出题人又**额外对数据模块叠加了一次 Mask 3**（`(i+j)%3==0` 的异或），这才是"3号面具"的真正含义。

所以要恢复：**只对数据模块**（跳过功能图形）再异或一次 Mask 3，剩下的交给标准解码器（它会自动用 format info 里的 mask 4 完成反转）。

**为什么必须"只对数据模块"？** 如果对整个矩阵（包括 finder/timing/alignment/format info）都做异或，会破坏定位图案和格式信息，解码器直接找不到二维码。功能图形永远不参与数据 mask，这是标准规定的。

#### 解码核心逻辑

```python
def is_function(i, j, N=37):
    # 三个角的 finder + separator + format info 区域（9x9）
    if i <= 8 and j <= 8: return True
    if i <= 8 and j >= N-9: return True
    if i >= N-9 and j <= 8: return True
    # timing pattern
    if i == 6 or j == 6: return True
    # alignment pattern（version5 中心 30,30，5x5）
    if abs(i-30) <= 2 and abs(j-30) <= 2: return True
    return False

for i in range(N):
    for j in range(N):
        if not is_function(i, j) and (i + j) % 3 == 0:
            m[i, j] = 255 - m[i, j]   # 异或反转
```

处理完放大交给 pyzbar 解码，直接得到结果。

---

## 总结

这两道题串起来是一套很完整的流量分析 + 隐写思路：

1. **隐写不一定在 payload 里**：`ip.id` 这种协议头字段一样能藏数据。
2. **DNS 外带还原的关键是分清通道**：发往哪个 DNS 服务器、qname 后缀是什么，过滤错了数据就拼不起来。
3. **ZipCrypto 是流密码**，check byte 的取值规则跟文件头 flags 的 data descriptor 位有关。
4. **QR 的 mask 只作用于数据模块**：功能图形不能碰，否则解码器直接找不到码。
