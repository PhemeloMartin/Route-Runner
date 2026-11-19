import { chapter } from '../dsl.js';

export default chapter`
@chapter cloud.c02 | Linux Administration: Users, Permissions, Packages and Services | 2
@sources Ubuntu Practice and Configuration (sudo, adduser, apt, services, Apache); OS & Server Management Topic 5-6 (Ubuntu Server); LFS101
@story
Lindiwe hands Phemelo the keys to a real server: "Kuruman Marketplace needs a website by tonight, and a new junior admin starts tomorrow. Install, secure, share. This is the daily job of a Linux admin - and every cloud engineer does it, just at bigger scale."
@lab linux:web-server | Linux Mission 2 - Launch a Web Server
@lab linux:users-perms | Linux Mission 3 - Users, Groups and Permissions

=== lesson c02-1 | Users, Groups and sudo | 20
@analogy sudo is like a manager's swipe card you borrow for one door. You don't become the manager - you just get through that door, and the system logs that you used the card.
@objectives
- Create users and groups and add users to groups
- Use sudo safely and understand root
- Read /etc/passwd and /etc/group
@body
Every user has a **UID**, a primary group, a home directory and a shell. Accounts live in [[/etc/passwd]], hashed passwords in [[/etc/shadow]] (root-only), groups in [[/etc/group]].

**On Ubuntu you don't log in as root** - you use **sudo** to run single commands with root privileges, authenticated with **your own** password. Members of the **sudo** group may do this. Everything is logged in [[/var/log/auth.log]] (accountability!).

~~~
sudo adduser thabo          # friendly: creates home, asks for password
sudo useradd -m -s /bin/bash lerato   # low-level alternative (-m = make home)
sudo passwd lerato
sudo groupadd finance
sudo usermod -aG sudo,finance thabo   # -a APPEND - never forget it!
groups thabo
id thabo
sudo deluser --remove-home olduser
~~~
**The [[usermod -G]] trap:** without **-a**, the user is *removed* from every group not listed (including sudo!). Always [[-aG]].

[[sudo -i]] opens a root shell - use sparingly; [[exit]] to leave. Principle of **least privilege**: give people only the access they need.
@terms
- sudo :: Run a command as root using your own password; logged for accountability
- UID :: User ID number; root is 0, regular users start at 1000
- /etc/shadow :: Root-only file containing password hashes
- usermod -aG :: Append a user to supplementary groups
- Least privilege :: Give users only the permissions they need
@pro
- "I always use usermod -aG; without -a the user loses their other groups."
@quiz
? Which command adds thabo to the docker group without removing his other groups?
+ sudo usermod -aG docker thabo
- sudo usermod -G docker thabo
- sudo groupadd thabo docker
- sudo useradd docker thabo
> -a means APPEND: thabo joins docker and keeps all his existing groups.
? Where are password hashes stored?
- /etc/passwd
+ /etc/shadow
- /home/user/.password
- /var/log/auth.log
> /etc/shadow, readable only by root.
? Why does Ubuntu prefer sudo over logging in as root?
+ Accountability (logged per user) and less risk of accidental damage
- sudo is faster
- root doesn't exist
- sudo doesn't need a password
> Least privilege + audit trail.

=== lesson c02-2 | File Permissions and Ownership | 25
@analogy Permissions are three key rings - one for the owner, one for the owner's team (group), one for everyone else. Each ring can have up to three keys: read, write, execute.
@objectives
- Read rwx permission strings
- Use chmod in numeric (755) and symbolic (u+x) form
- Use chown and understand why scripts need +x
@body
[[ls -l]] shows e.g. **-rwxr-x---  1 phemelo finance  report.sh**
- First character: **-** file, **d** directory, **l** link
- Then three triples: **owner (u)**, **group (g)**, **others (o)**
- **r** = read (4), **w** = write (2), **x** = execute (1) - for directories x means "can enter"

**Numeric:** add the values per triple. rwx=7, r-x=5, r--=4, rw-=6.
| chmod | Result | Typical use |
|---|---|---|
| 755 | rwxr-xr-x | scripts, directories |
| 644 | rw-r--r-- | normal files, web pages |
| 600 | rw------- | private keys, netplan files |
| 770 | rwxrwx--- | shared team folder |
| 777 | rwxrwxrwx | **almost never** - anyone can change it |

**Symbolic:** [[chmod u+x script.sh]], [[chmod g-w file]], [[chmod o= secret]].
**Ownership:** [[sudo chown thabo:finance file]], [[sudo chown -R www-data:www-data /var/www]].

A script won't run with [[./script.sh]] until it has execute permission ("Permission denied") - you'll hit this in the lab. SSH refuses private keys that are readable by others - keep them 600.
@terms
- rwx :: Read (4), write (2), execute (1) permissions
- chmod :: Change permission bits (numeric 755 or symbolic u+x)
- chown :: Change file owner and group
- 755 :: rwxr-xr-x - owner full, everyone else read/execute
- 600 :: rw------- - private files like SSH keys
@pro
- "chmod 600 on private keys - SSH refuses keys that other users can read."
@quiz
?= What numeric mode is rw-r--r--?
= 644
> 6 (rw-), 4 (r--), 4 (r--).
? A script gives "Permission denied" when run with ./backup.sh. The fix?
+ chmod +x backup.sh
- chown root backup.sh
- rm backup.sh
- sudo cat backup.sh
> It needs the execute bit.
? What does chmod 770 on /srv/reports allow?
+ Owner and group full access; others nothing
- Everyone full access
- Only the owner can read
- Others can read only
> 7 (rwx) for the owner, 7 (rwx) for the group, 0 (nothing) for everyone else.

=== lesson c02-3 | Packages, Services and Logs | 25
@analogy apt is an app store for your server. systemd is the building manager who starts every service when the building opens in the morning, restarts any that crash, and keeps a logbook (the journal).
@objectives
- Update, install and remove software with apt
- Manage services with systemctl (start, stop, enable, status)
- Read logs with journalctl and /var/log
@body
**apt:**
~~~
sudo apt update            # refresh the list of available packages (do this first)
sudo apt upgrade -y        # install updates (security patches!)
sudo apt install nginx -y  # install
sudo apt remove nginx      # remove
apt search firewall        # find
apt list --installed
~~~
"Command 'ifconfig' not found, but can be installed with: sudo apt install net-tools" - Ubuntu tells you which package you need.

**systemd services:**
| Command | Meaning |
|---|---|
| [[systemctl status nginx]] | running? since when? recent log lines |
| [[sudo systemctl start nginx]] / stop / restart | now |
| [[sudo systemctl enable nginx]] | start automatically at **boot** |
| [[sudo systemctl enable --now nginx]] | enable + start |
| [[systemctl is-active nginx]] | scripting-friendly |
**start** affects now; **enable** affects the next boot - a classic mistake is starting a service but forgetting to enable it, so it's gone after a reboot.

**Logs:** [[journalctl -u nginx]] (one service), [[journalctl -xe]] (recent errors with explanations), [[sudo tail -f /var/log/syslog]], [[/var/log/auth.log]] (logins), [[/var/log/nginx/error.log]].

**Ports in use:** [[sudo ss -tulpn]] shows which program listens on which port - e.g. if Apache won't start because nginx already owns port 80.
@terms
- apt update :: Refreshes package lists (doesn't install anything)
- apt upgrade :: Installs newer versions of installed packages
- systemd :: The init system that starts and supervises services
- systemctl enable :: Makes a service start at boot
- journalctl :: Reads the systemd journal (logs)
- ss -tulpn :: Shows listening TCP/UDP ports and the owning processes
@pro
- "start runs the service now; enable makes it survive a reboot - I use enable --now for both."
@interview Your web server works, but after a reboot the website is down. What happened? :: The service was started but never enabled, so systemd didn't start it at boot. I'd confirm with systemctl status nginx (it would show disabled/inactive), then run sudo systemctl enable --now nginx and test with curl localhost.
@quiz
? Which command makes nginx start automatically at boot?
- sudo systemctl start nginx
+ sudo systemctl enable nginx
- sudo apt install nginx --boot
- sudo service nginx reload
> enable = at boot.
? What does "sudo apt update" do?
+ Refreshes the list of available packages
- Upgrades every package
- Updates the kernel only
- Installs updates from Windows Update
> Then apt upgrade installs them.
? Apache fails to start: "Address already in use". Which command finds the culprit?
+ sudo ss -tulpn
- ls -la
- chmod 755
- apt list
> See who owns port 80.

=== boss
?= What numeric permission gives rwxr-xr-x?
= 755
> rwx = 4+2+1 = 7, r-x = 4+1 = 5, r-x = 5 -> 755.
? A new admin must run admin commands. Best practice?
+ Add them to the sudo group
- Give them the root password
- chmod 777 /
- Let them use your account
> Personal accountability via sudo.
? Which command shows the last log lines and status of a service?
+ systemctl status ssh
- ls /etc/ssh
- apt show ssh
- chmod ssh
> status includes recent journal lines.
? Which file permission is required to "cd" into a directory?
- r
- w
+ x
- s
> Execute on a directory = enter it.
? After installing nginx you can't reach it from a remote PC but curl localhost works. A likely reason?
+ The host firewall (ufw) blocks port 80
- nginx isn't installed
- The disk is full
- The kernel is old
> Local works, remote doesn't -> firewall or binding.
`;
