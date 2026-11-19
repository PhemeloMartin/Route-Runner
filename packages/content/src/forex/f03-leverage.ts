import { chapter } from '../dsl.js';

export default chapter`
@chapter forex.f03 | Leverage, Margin and Swaps | 3
@story
A broker advert flashes on Phemelo's phone: "Trade with 1:1000 leverage - turn R1,000 into R1,000,000 of buying power!" Thabang shakes his head. "Leverage is a chainsaw. In trained hands it cuts wood. In untrained hands it cuts you. Today you learn exactly how it works - and why the sensible leverage is the one you barely use."

=== lesson f03-1 | Leverage and Margin Explained | 25
@analogy Leverage is like buying a house with a bond: you put down a 10% deposit and control the whole house. If the house price rises 10%, you've doubled your deposit. If it falls 10%, your whole deposit is gone. Forex leverage works the same way, just much faster.
@objectives
- Explain leverage and margin with numbers
- Show how leverage magnifies gains AND losses
- Understand that leverage doesn't change pip value - lot size does
@body
**Leverage** lets you control a big position with a small deposit called **margin**.
- Leverage **1:30** -> margin = 1/30 = **3.33%** of the position
- Leverage **1:100** -> margin = **1%**; **1:500** -> **0.2%**

Example: 1 standard lot EUR/USD at 1.0850 = **$108,500** notional.
- At 1:30 the broker locks **$3,617** of your money as margin.
- At 1:500 only **$217**.

**Here's the trap:** leverage doesn't change how much you win or lose per pip - **lot size** does. 1 lot = $10/pip at ANY leverage. High leverage just *allows* you to open a position far too big for your account. With a $1,000 account, 1 lot means a 100-pip move against you (a normal day) loses **$1,000 - everything**.

**Effective leverage** = total position size / account equity. Professionals often run **under 5:1** effective leverage.

**Regulation:** EU/UK regulators cap retail leverage at **30:1** on major pairs (20:1 for others) precisely because high leverage destroyed retail accounts. Many offshore and some South African brokers offer 1:500 or more - treat that as a **danger**, not a feature. The Route Runner demo accounts use 1:30.
@terms
- Leverage :: Controlling a large position with a small deposit (e.g. 1:30)
- Margin :: The deposit locked to open a leveraged position
- Notional value :: Full value of a position (units x price)
- Effective leverage :: Total position value divided by account equity
@pro
- "Leverage only changes the margin required; my risk is set by lot size and stop distance."
@interview Why is 1:500 leverage dangerous for beginners? :: Because it lets a small account open positions far larger than it can survive. Risk per pip is set by lot size, and high leverage removes the brake on lot size - a beginner can open several standard lots with R5,000 and be wiped out by a normal daily move. I'd use low effective leverage and size every trade from a fixed percentage risk instead.
@quiz
?= With 1:50 leverage, what percentage of the position is required as margin?
= 2 | 2%
> Margin = 1 / leverage = 1/50 = 2% of the position value.
? Does increasing leverage from 1:30 to 1:500 change the pip value of a 1-lot EUR/USD trade?
+ No - pip value depends on lot size, not leverage
- Yes, it multiplies it by 16
- Yes, it halves it
- Only on Fridays
> Leverage changes margin only.
? 1 lot EUR/USD at 1.1000 with 1:100 leverage needs how much margin?
+ $1,100
- $110,000
- $11
- $100
> $110,000 / 100.

=== lesson f03-2 | Equity, Free Margin, Margin Calls and Stop-Outs | 20
@analogy Margin level is the fuel gauge of your account. When it drops to the red line (margin call), the dashboard warns you. If it hits empty (stop-out), the engine cuts out - the broker closes your trades for you, at the worst possible moment.
@objectives
- Calculate equity, used margin, free margin and margin level
- Explain margin calls and stop-outs
@body
- **Balance** - money in the account from closed trades.
- **Equity** = balance + **floating** (unrealised) profit/loss of open trades.
- **Used margin** - locked by open positions.
- **Free margin** = equity - used margin -> what's available for new trades.
- **Margin level** = equity / used margin x 100%.

Example: balance $1,000, one trade using $300 margin, currently -$400 floating.
Equity = $600; free margin = $300; margin level = 600/300 = **200%**.

Brokers set two thresholds (check yours - they vary):
- **Margin call** (e.g. 100%) - warning; you can't open new trades.
- **Stop-out** (e.g. 50%) - the broker **automatically closes** your positions, largest loser first, to protect itself.

A stop-out is the market's way of saying your position was too big. The cure is never "add more money" - it's smaller positions with stop-losses so you're never near the stop-out level. The Route Runner demo engine stops out at 50%, exactly like real platforms.

**Negative balance protection** - regulated brokers in many jurisdictions guarantee you can't lose more than your deposit (gaps can otherwise push equity below zero). Ask your broker.
@terms
- Equity :: Balance plus floating profit/loss
- Free margin :: Equity minus used margin
- Margin level :: Equity divided by used margin, as a percentage
- Margin call :: Warning when margin level falls to the broker's threshold
- Stop-out :: Automatic closing of positions when margin level falls too low
- Negative balance protection :: Guarantee that losses can't exceed the deposit
@pro
- "If I'm worried about margin calls, my position size is wrong."
@quiz
?= Balance $2,000, floating loss -$500, used margin $500. Margin level (%)?
= 300 | 300%
> Equity 1,500 / 500 = 300%.
? What happens at the stop-out level?
+ The broker automatically closes positions
- You get a bonus
- Your leverage increases
- Trading is free
> Forced liquidation.
? Equity is...
+ balance plus floating profit or loss
- deposits only
- used margin only
- the broker's money
> Live account value.

=== lesson f03-3 | Swaps and Overnight Costs | 15
@analogy Holding a leveraged trade overnight is like borrowing one currency to buy another. You pay interest on what you borrowed and earn interest on what you hold. The difference is the swap - sometimes you get paid, usually you pay.
@objectives
- Explain swap/rollover and why it can be positive or negative
- Know about triple swap and swap-free accounts
@body
Spot FX settles in two days, so positions held past the daily rollover (around **17:00 New York time - about 23:00/00:00 SAST**) are "rolled over" and charged or paid a **swap** based on the **interest rate difference** between the two currencies, plus a broker markup.
- Buying a high-interest currency against a low-interest one can earn a positive swap (the **carry trade** idea) - but the broker's markup often makes both sides negative.
- **USD/ZAR**: South African rates are usually higher than US rates, so **buying USD/ZAR** (short rand) tends to **cost** swap each night; selling it can earn some - check your broker's swap table.
- **Triple swap** - usually charged on **Wednesday** night to cover the weekend.
- **Swap-free (Islamic) accounts** have no swaps but may charge other fees.

For day traders swaps don't matter; for swing traders holding for weeks they can add up. Always check the **contract specifications**.
@terms
- Swap / rollover :: Overnight interest charged or paid on open positions
- Carry trade :: Holding a high-yield currency against a low-yield one to earn the interest difference
- Triple swap :: Three days of swap charged once a week (usually Wednesday) for the weekend
- Swap-free account :: Account without overnight interest charges
@pro
- "Before a multi-week swing trade I check the swap - it can quietly eat the profit."
@quiz
? When is a swap applied?
+ When a position is held past the daily rollover time
- Every time you open a trade
- Only on weekends
- Only on profitable trades
> Overnight financing.
? On which night is the triple swap usually charged?
- Monday
+ Wednesday
- Friday
- Sunday
> Covers the weekend settlement.
? Why might buying USD/ZAR cost swap each night?
+ South African interest rates are usually higher than US rates
- The rand doesn't trade at night
- USD has no interest rate
- Swaps are random
> Short the high-yielder = pay.

=== boss
? A trader with $500 opens 2 standard lots of EUR/USD thanks to 1:500 leverage. A 25-pip move against him loses...
+ $500 - his whole account
- $5
- $50
- Nothing, leverage protects him
> 2 lots = $20/pip x 25.
? Which statement is TRUE?
+ Lot size determines money per pip; leverage determines margin required
- Higher leverage always means higher profit
- Leverage reduces risk
- Margin is a broker fee
> Key concept.
? Your margin level falls to the broker's stop-out level. What happens?
+ Positions are closed automatically
- The broker adds funds
- Leverage resets to zero
- You receive a margin bonus
> Forced closure.
? EU/UK retail leverage cap on major pairs is...
+ 30:1
- 500:1
- 1000:1
- 2:1
> ESMA/FCA rules.
`;
