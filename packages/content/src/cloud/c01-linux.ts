import { chapter } from '../dsl.js';

export default chapter`
@chapter cloud.c01 | Linux Foundations: Your Cloud's Operating System | 1
@sources LFS101 Introduction to Linux (your certificate); OS & Server Management: Linux slides & exercises, Ubuntu Practice and Configuration (APRICOT); OS research: Linux example.docx
@story
The Cloud Tower's lift opens on a room full of screens - and not a single Windows desktop. "Over 90% of cloud servers run Linux," says Lindiwe, the Cloud Tower mentor. "Every container, every Kubernetes node, every supercomputer. If the terminal scares you, the cloud will too. So we start here - in the terminal."
@lab linux:first-steps | Linux Mission 1 - Find Your Way Around

=== lesson c01-1 | What Linux Is and Why the Cloud Runs on It | 15
@analogy The Linux kernel is a car engine. A distribution (Ubuntu, Red Hat, Debian) is a complete car built around that engine - same engine, different body, dashboard and warranty.
@objectives
- Explain kernel, distribution, shell and open source
- Name the major distributions and where they are used
- Explain why the cloud prefers Linux
@body
**Linux** is a free, open-source, Unix-like operating system **kernel** created by Linus Torvalds in 1991. Around it, a **distribution (distro)** bundles tools, a package manager and defaults:
- **Debian family:** **Ubuntu** (your ISO is Ubuntu Server 24.04.3 LTS), Debian - package manager **apt** (.deb)
- **Red Hat family:** RHEL, Rocky Linux, AlmaLinux, Fedora, Amazon Linux - package managers **dnf/yum** (.rpm)
- Others: SUSE, Alpine (tiny, popular for containers), Arch

**LTS (Long Term Support)** releases (Ubuntu 22.04, 24.04) get 5+ years of security updates - that's what servers run.

**Why the cloud runs Linux:** free (no per-server licence), stable for years of uptime, scriptable from the terminal, lightweight (no GUI on servers), open source (inspect and fix it), and it powers containers natively (namespaces and cgroups are Linux kernel features).

**The shell** (bash, zsh) is the program that reads your commands. Its prompt [[phemelo@ubuntu-srv:~$]] tells you **user @ host : current-directory**, then **$** for a normal user or **#** for root.
@terms
- Kernel :: The core of the OS that manages hardware, memory and processes
- Distribution :: A complete OS built around the Linux kernel (Ubuntu, RHEL, Debian)
- LTS :: Long Term Support release - years of security updates
- Shell :: Command interpreter such as bash
- Root :: The all-powerful administrator account (UID 0)
@pro
- "Production servers run an LTS release so they get security patches for years."
@quiz
? Which package manager does Ubuntu use?
+ apt
- dnf
- yum
- pacman
> Debian family = apt and .deb packages.
? In the prompt "phemelo@web01:/var/log$", what is web01?
- The user
+ The hostname
- The current directory
- The shell
> user@host:directory.
? Why do most cloud servers run Linux?
+ Free licensing, stability, scriptability and native container support
- It has the best games
- It requires a GUI
- It only runs on AWS
> Cost and automation are huge in the cloud.

=== lesson c01-2 | The Filesystem and Moving Around | 25
@analogy The Linux filesystem is one big upside-down tree. The root "/" is the trunk at the top; every folder is a branch. There are no C: or D: drives - extra disks are grafted onto branches (mounted).
@objectives
- Describe the Filesystem Hierarchy Standard
- Use pwd, ls, cd with absolute and relative paths
- Create, view, copy, move and delete files safely
@body
**Key directories (FHS):**
| Path | What lives there |
|---|---|
| / | root of everything |
| /home/phemelo | your files (~) |
| /root | root user's home |
| /etc | **configuration files** (text) |
| /var/log | **log files** |
| /var/www | web content |
| /tmp | temporary files (wiped on reboot) |
| /usr/bin, /bin | programs |
| /dev | devices (disks, /dev/null) |
| /proc | live kernel/process info (cat /proc/cpuinfo) |
| /opt, /srv | optional software, served data |

**Navigation:** [[pwd]] (where am I), [[ls -la]] (list everything incl. hidden dot-files, long format), [[cd /etc]] (absolute path - starts with /), [[cd ..]] (up one), [[cd ~]] or [[cd]] (home), [[cd -]] (previous directory).

**Files:** [[mkdir -p a/b/c]], [[touch file.txt]], [[cat file]], [[less file]] (q to quit), [[head -n 5]], [[tail -n 20]], [[cp src dst]], [[cp -r dir1 dir2]], [[mv old new]] (move or rename), [[rm file]], [[rm -r dir]].
**There is no recycle bin** - [[rm]] is permanent. Never run [[rm -rf /]] or anything you copied blindly from the internet.

**Getting help:** [[man ls]], [[ls --help]], and in Route Runner [[explain chmod]] gives a plain-English summary. Press **Tab** to auto-complete names - it prevents typos.
@terms
- / (root directory) :: The top of the Linux filesystem tree
- /etc :: Directory holding system configuration files
- /var/log :: Directory holding log files
- Absolute path :: Starts from / (e.g. /etc/hosts)
- Relative path :: Starts from the current directory (e.g. ../logs)
- Hidden file :: A file whose name starts with a dot; shown by ls -a
@pro
- "Configuration lives in /etc and logs live in /var/log - that's where I look first."
@quiz
? Where are system configuration files stored?
+ /etc
- /bin
- /home
- /tmp
> /etc = configs.
? Which command shows hidden files in long format?
- ls
- ls -l
+ ls -la
- dir /h
> -a includes dot-files, -l is long format.
?= Which command prints the current directory?
= pwd
> Print Working Directory.
? What does "cd .." do?
+ Moves up one directory
- Goes to the home directory
- Goes to /
- Lists files
> .. = parent directory.

=== lesson c01-3 | Pipes, Redirection, grep and Text Power Tools | 20
@analogy Pipes are like a factory line: the first machine (cat) puts parts on the belt, the next (grep) picks only the red ones, the next (wc) counts them. Each machine does one simple job; together they're powerful.
@objectives
- Redirect output to files with > and >>
- Chain commands with pipes
- Search and count with grep, wc, sort, uniq, head, tail
@body
- [[command > file]] - write output to a file (**overwrites**)
- [[command >> file]] - **append** to a file
- [[command 2>/dev/null]] - throw away error messages
- [[cmd1 | cmd2]] - pipe: output of cmd1 becomes input of cmd2
- [[cmd1 && cmd2]] - run cmd2 only if cmd1 succeeded; [[cmd1 ; cmd2]] - run both regardless

**Everyday combos for sysadmins:**
~~~
grep -i error /var/log/syslog                 # find errors (case-insensitive)
grep -c "Failed password" /var/log/auth.log   # count failed SSH logins
cat access.log | sort | uniq -c | sort -rn | head  # most frequent lines
ps aux | grep nginx                           # is nginx running?
tail -f /var/log/syslog                       # follow a log live
history | grep apt                            # what did I install?
~~~
**Quotes matter:** "double quotes" expand variables like $HOME; 'single quotes' keep text literal (you'll need single quotes when writing scripts with echo).
@terms
- Redirection :: Sending output to a file with > (overwrite) or >> (append)
- Pipe :: | - sends one command's output into another command
- grep :: Searches text for a pattern
- /dev/null :: A "black hole" file that discards anything written to it
@pro
- "I grep the auth log for failed passwords to spot brute-force attempts."
@quiz
? Which operator APPENDS output to a file?
- >
+ >>
- |
- &&
> > overwrites, >> appends.
? What does "ps aux | grep nginx" do?
+ Lists all processes and shows only lines containing nginx
- Installs nginx
- Kills nginx
- Starts nginx
> A pipe filters ps output.
? "mkdir test && cd test" - when does cd run?
+ Only if mkdir succeeds
- Always
- Never
- Before mkdir
> && = only on success.

=== boss
? Which directory holds log files?
+ /var/log
- /etc/log
- /logs
- /usr/log
> Logs live in /var/log.
? You run "rm important.txt" by mistake. How do you get it back?
- From the recycle bin
+ From a backup - rm is permanent
- With undo
- With rm -u
> No trash on the command line.
?= Which command shows the last 20 lines of /var/log/syslog?
= tail -n 20 /var/log/syslog | tail -20 /var/log/syslog
> tail shows the end of a file.
? Which distribution family uses dnf/yum and .rpm packages?
- Debian
+ Red Hat
- Alpine
- Ubuntu
> RHEL, Rocky, Fedora, Amazon Linux.
? What does the # at the end of a prompt mean?
+ You are root
- You are in /home
- The disk is full
- You have mail
> $ normal user, # root.
`;
