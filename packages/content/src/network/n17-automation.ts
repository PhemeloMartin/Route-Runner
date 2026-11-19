import { chapter } from '../dsl.js';

export default chapter`
@chapter network.n17 | AI, Automation and Network Operations | 17
@domain 5.0 AI, Network Operations, and Management
@sources CCNA v2.0 blueprint (May 2026): AI/agentic AI and prompting, management approaches, SNMP, syslog, Ansible; v1.1 Automation & Programmability (SDN, REST, JSON)
@story
The Marketplace now has 3 branches, 12 switches and 6 routers. Changing one VLAN means 12 SSH sessions and 12 chances to typo. "In 2026, engineers who only type commands one box at a time are being replaced," says Mma Neo, "by engineers who write the playbook once - and who know how to use AI safely to help them."
@lab cloud:iac | Ansible + Terraform lab in the Cloud Tower

=== lesson n17-1 | Monitoring and Management: SNMP, Syslog, NetFlow | 25
@analogy SNMP is a nurse checking every patient's temperature on a schedule. Syslog is the patient pressing the call button when something happens. NetFlow is the hospital visitor log - who visited whom, and for how long.
@objectives
- Compare SNMP versions and polling vs traps
- Read syslog severity levels
- Explain what NetFlow tells you
@body
**SNMP** - a **manager** (NMS) polls **agents** on devices (UDP **161**) for values in the **MIB** (interface counters, CPU, temperature); agents send **traps/informs** on events (UDP **162**).
- **v1/v2c** - community strings in **clear text** (RO/RW). Avoid RW.
- **v3** - **authentication and encryption** (authPriv). Use this.

**Syslog** (UDP **514**) - devices send event messages to a syslog server. Format: [[%LINK-3-UPDOWN: Interface Gi0/1, changed state to down]] = facility-**severity**-mnemonic.
| Level | Name | Memory hook |
|---|---|---|
| 0 | Emergency | **E**very |
| 1 | Alert | **A**wesome |
| 2 | Critical | **C**isco |
| 3 | Error | **E**ngineer |
| 4 | Warning | **W**ill |
| 5 | Notification | **N**eed |
| 6 | Informational | **I**ce-cream |
| 7 | Debugging | **D**aily |
Lower number = more severe. [[logging host 10.0.0.50]], [[logging trap warnings]] (sends levels 0-4). Add [[service timestamps log datetime msec]] and NTP so logs line up.

**NetFlow** - records **flows** (src/dst IP and port, protocol, bytes) - who talks to whom. Great for capacity planning and spotting anomalies (sudden traffic to an unknown country at 3 a.m.).
@terms
- SNMP :: Simple Network Management Protocol - polls devices (UDP 161) and receives traps (UDP 162)
- MIB :: Management Information Base - the tree of values an SNMP agent exposes
- SNMPv3 :: Secure SNMP with authentication and encryption
- Syslog severity :: 0 Emergency (worst) to 7 Debugging
- NetFlow :: Records traffic flows for analysis
@pro
- "I use SNMPv3 with authPriv; v2c community strings travel in clear text."
@quiz
?= What syslog severity number is "Warning"?
= 4
> 0 Emerg, 1 Alert, 2 Crit, 3 Err, 4 Warn, 5 Notice, 6 Info, 7 Debug.
? Which SNMP version adds encryption?
- v1
- v2c
+ v3
- v4
> v3 authPriv.
? An agent sends an unsolicited alert to the manager. This is a...
- GET
+ trap
- SET
- walk
> Traps/informs are agent-initiated.

=== lesson n17-2 | Controller-Based Networking, APIs, JSON and Ansible | 30
@analogy Traditional networking is every traffic light deciding its own timing. Controller-based networking (SDN) is a central traffic control room that sees the whole city and programs every light. APIs are the phone line the control room uses to talk to the lights.
@objectives
- Compare traditional and controller-based networking (planes, northbound/southbound APIs)
- Read REST API calls and JSON/YAML
- Explain Ansible and other configuration management tools
@body
**Three planes:** **management** (SSH, SNMP - how you configure it), **control** (OSPF, STP - the brain building tables), **data/forwarding** (moving packets using the FIB/MAC table).

**Traditional networking** - every device has its own control plane, configured box-by-box with the CLI. **Controller-based (SDN)** - a **controller** (e.g. **Cisco Catalyst Center**, formerly DNA Center) centralises policy and pushes config. **Northbound APIs** (REST) let apps and scripts talk to the controller; **southbound** (NETCONF, RESTCONF, OpenFlow, SSH) let the controller talk to devices. **Intent-based networking**: you declare *what* you want ("Guests can't reach Finance"); the controller works out *how*.

**REST APIs** use HTTP verbs: **GET** (read), **POST** (create), **PUT/PATCH** (update), **DELETE**. Status codes: **200** OK, **201** Created, **204** No Content, **400** Bad Request, **401** Unauthorized, **403** Forbidden, **404** Not Found, **500** Server Error. Authentication: tokens, API keys, OAuth.

**JSON** - the data format of APIs:
~~~
{
  "hostname": "KMP-R1",
  "interfaces": [ { "name": "Gi0/0/0", "ip": "192.168.10.1", "enabled": true } ]
}
~~~
Objects {key: value}, arrays [...], strings in double quotes, numbers, true/false, null. **YAML** is the same data, indentation-based (used by Ansible and Kubernetes).

**Configuration management:**
| Tool | Agent? | Language | Push/pull |
|---|---|---|---|
| **Ansible** | **agentless** (SSH) | YAML playbooks | push |
| Puppet | agent | Ruby DSL | pull |
| Chef | agent | Ruby | pull |
| Terraform | agentless | HCL | declarative provisioning (cloud) |
Ansible uses an **inventory** (which devices) and **playbooks** of **tasks** using modules like [[ios_config]] and [[ios_command]]. CCNA v2.0 lists Ansible explicitly - you'll run it in the Cloud Tower.
@terms
- Control plane :: The device "brain" - routing protocols, STP, building tables
- Data plane :: Forwards packets/frames using the tables
- SDN controller :: Centralised software that programs network devices
- Northbound API :: Interface between the controller and applications/scripts
- Southbound API :: Interface between the controller and network devices
- REST :: API style using HTTP verbs on resources (GET/POST/PUT/DELETE)
- JSON :: JavaScript Object Notation - key/value data format used by APIs
- Ansible :: Agentless, YAML-based automation tool that pushes config over SSH
@pro
- "Ansible is agentless - it connects over SSH and applies YAML playbooks, so it's ideal for network devices."
@interview Why would a company move to controller-based networking? :: Consistency and speed. Policies are defined once on the controller and pushed to every device, which removes typos and configuration drift. It gives a single view of the network, APIs for automation and integration, and faster troubleshooting with assurance data, instead of logging into hundreds of boxes one by one.
@quiz
? Which HTTP status code means "Unauthorized"?
- 200
- 404
+ 401
- 500
> 401 = missing/invalid authentication; 403 = authenticated but not allowed.
? Which REST verb retrieves data without changing it?
+ GET
- POST
- PUT
- DELETE
> GET is read-only.
? Which tool is agentless and uses YAML playbooks?
+ Ansible
- Puppet
- Chef
- SaltStack minion
> Ansible pushes over SSH.
? OSPF and STP belong to which plane?
- Data plane
+ Control plane
- Management plane
- User plane
> They build the tables.

=== lesson n17-3 | AI in Network Operations - Using It Safely | 25
@analogy An AI assistant is a brilliant new intern who has read every manual but has never touched YOUR network. Great for drafts and ideas - but you check every command before it goes near production, and you never hand it the master keys.
@objectives
- Describe how AI/ML is used in network operations and security
- Distinguish AI recommendations from static threshold alerts
- Write effective, safe prompts and understand agentic AI risks
@body
CCNA v2.0 adds a domain on **AI in network operations**. What you should be able to explain:

**Where AI/ML helps:**
- **Assurance & anomaly detection** - ML learns a **baseline** of normal behaviour (latency, client counts, DHCP failures per hour) and flags deviations. A **static threshold** says "alert if CPU > 80%"; an **AI baseline** says "CPU is 45%, but that's 3x unusual for 2 a.m. on a Sunday".
- **Predictive maintenance** - spotting failing optics, rising CRC errors or PSU trends *before* an outage.
- **Root-cause analysis** - correlating thousands of events into one probable cause.
- **Security** - **Encrypted Traffic Analytics** detects malware in encrypted flows from packet timing/size patterns without decrypting.
- Platforms: **Cisco Catalyst Center (DNA Center) AI assurance**, **Meraki** cloud insights, ThousandEyes.

**Generative AI and prompting** - LLM assistants can draft configs, explain output, write Ansible playbooks and summarise logs. Good prompts give **context** (device model, IOS version, topology), a **clear task**, **constraints** ("IOS-XE 17, no changes to OSPF") and the **output format** ("only the config, then a verification list").

**Agentic AI** - AI that can *act* (run show commands, open tickets, even push changes) through tools/APIs. Guardrails: **least privilege** (read-only first), **human approval** for changes, change windows, logging every action, and testing in a lab.

**Risks:** **hallucinations** (confident but wrong commands that don't exist), leaking sensitive configs/passwords into external services (POPIA!), over-trust. **Always verify against documentation and test in a lab - like the Route Runner simulator - before production.**
@terms
- Baseline :: Learned "normal" behaviour that ML compares new data against
- Static threshold alert :: A fixed rule, e.g. alert when CPU exceeds 80%
- Predictive maintenance :: Using trends to fix problems before they cause outages
- Encrypted Traffic Analytics :: Detecting threats in encrypted traffic without decrypting it
- Agentic AI :: AI that can take actions through tools and APIs, not just answer
- Hallucination :: AI output that sounds right but is factually wrong
@pro
- "A static threshold fires on a fixed number; an ML baseline fires when behaviour is unusual for that time and context."
- "AI can draft the change, but a human reviews it and it's tested in a lab before production."
@quiz
? Which is an example of an AI/ML-driven alert rather than a static threshold?
- Alert when interface utilisation exceeds 90%
+ Alert because DHCP failures are far above the learned normal for this site and time
- Alert when a link goes down
- Alert when the temperature is above 60 degrees
> Baseline deviation = ML.
? What is the safest way to use agentic AI on a production network?
+ Read-only access first, human approval for changes, and full logging
- Give it enable access so it can fix things fast
- Let it change configs only at night
- Disable logging to save space
> Least privilege + human in the loop.
? An AI assistant suggests "ip ospf turbo-mode enable". What should you do?
- Paste it into production
+ Verify it in documentation or a lab - it may be a hallucination
- Reload the router first
- Ask the AI if it's sure, then apply it
> That command doesn't exist.

=== boss
? Which management approach is described: "declare the desired outcome; the controller works out device configs"?
+ Intent-based networking
- Traditional CLI management
- SNMP polling
- Static routing
> Intent-based / controller-based.
? Which port does SNMP polling use?
+ UDP 161
- UDP 162
- TCP 22
- UDP 514
> 162 is for traps.
? Which JSON is VALID?
+ {"vlan": 10, "name": "SALES"}
- {vlan: 10, name: SALES}
- ["vlan" = 10]
- {'vlan': 10}
> Keys and strings need double quotes.
? Logging trap level 3 sends which severities to the server?
+ 0 to 3
- 3 to 7
- Only 3
- 4 to 7
> The level and everything more severe.
? Which statement about Ansible is TRUE?
+ It is agentless and connects to network devices over SSH
- It requires an agent on every router
- It only works with Linux servers
- It uses JSON playbooks only
> YAML playbooks, push model.
? An LLM gives you a config. What is the professional next step?
+ Review it, check documentation, and test it in a lab before production
- Apply it immediately to save time
- Email it to the whole team
- Assume it's correct because it's detailed
> Trust, but verify.
`;
