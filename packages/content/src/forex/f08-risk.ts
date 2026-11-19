import { chapter } from '../dsl.js';

export default chapter`
@chapter forex.f08 | Risk Management - The Only Holy Grail | 8
@story
Thabang writes one sentence on the whiteboard and underlines it twice: "Your first job is not to make money. It's to stay in the game." "Every trader who blew an account," he says, "had good analysis on some trades. What they didn't have was risk management. This chapter is the most important in the whole stream."
@lab drill:pip | Position-size drills
@lab trading:floor | Use "Size it for me" on every demo trade

=== lesson f08-1 | The 1-2% Rule and Position Sizing | 30
@analogy Position sizing is choosing how big a bite to take. Take small bites and even a bad meal won't kill you. Take one huge bite and a single bone can choke you - no matter how good the rest of the meal was.
@objectives
- Apply the 1-2% risk-per-trade rule
- Calculate position size from risk and stop distance
- Explain why stops are set by the chart and size by the account
@body
**The rule:** risk no more than **1% (max 2%) of your account on any single trade.** Risk = the money you lose if the stop-loss is hit.

**The position-size formula (memorise it):**
**Lots = (Account x Risk %) / (Stop distance in pips x Pip value per lot)**

**Example:** $5,000 account, 1% risk = **$50**. EUR/USD stop = **25 pips**. Pip value = $10 per lot.
Lots = 50 / (25 x 10) = **0.20 lots**. (Always round **down**.)

**Order of operations - never reverse it:**
1. Find the trade on the chart and decide where the idea is **wrong** -> that's your **stop**.
2. Calculate the **lot size** from the stop distance and your 1% risk.
3. Check the target gives a decent reward:risk.
4. Only then place the order.

Beginners do the opposite - pick a lot size they "feel" and squeeze the stop to fit - and that's why they blow up. A wider stop simply means a smaller position; the money at risk stays the same.

**ZAR example:** R50,000 account, 1% = R500. USD/ZAR stop 600 pips; 1 lot = R10/pip. Lots = 500 / (600 x 10) = **0.08 lots**.

The Trading Floor's order ticket shows your % risk in green or red, and **"Size it for me"** applies this formula.
@terms
- Risk per trade :: Money lost if the stop-loss is hit, as a % of the account
- 1% rule :: Never risk more than 1% (max 2%) of the account on one trade
- Position sizing :: Calculating lot size from risk amount and stop distance
- Stop distance :: Pips between entry and stop-loss
@pro
- "The chart decides my stop; my account decides my position size."
@interview How do you decide how many lots to trade? :: I never choose lots first. I find where my trade idea is invalidated and put the stop there, then risk a fixed 1% of the account: lots equal the risk amount divided by stop distance times pip value per lot, rounded down. So a wider stop means a smaller position, and every trade risks the same money.
@quiz
?= $10,000 account, 1% risk, 50-pip stop on EUR/USD ($10/pip per lot). How many lots?
= 0.2 | 0.20
> $100 / (50 x $10) = 0.20.
?= $2,000 account, 2% risk, 20-pip stop on EUR/USD. Lots?
= 0.2 | 0.20
> $40 / (20 x $10) = 0.20.
? Your analysis needs a wider stop than usual. What should change?
+ Reduce the lot size so the money at risk stays the same
- Increase the lot size
- Remove the stop
- Move the stop closer anyway
> Size adapts to the stop.

=== lesson f08-2 | Reward:Risk, Win Rate and Expectancy | 25
@analogy A trading system is a business. Win rate is how often customers buy; reward:risk is your profit margin. A shop that sells to only 4 out of 10 visitors can still be very profitable - if each sale earns three times what each lost visitor costs.
@objectives
- Calculate reward:risk ratios
- Calculate expectancy and breakeven win rate
- Explain why a low win rate can still be profitable
@body
**Reward:Risk (R:R)** = (target distance) / (stop distance). Stop 30 pips, target 60 pips = **1:2**.
Think in **R**: 1R = the amount risked. A 1:2 winner = +2R; a loser = -1R.

**Expectancy per trade** = (Win rate x Average win in R) - (Loss rate x 1R).
- 40% wins at 1:2 -> 0.4 x 2 - 0.6 x 1 = **+0.2R per trade** (profitable)
- 60% wins at 1:0.5 -> 0.6 x 0.5 - 0.4 x 1 = **-0.1R** (losing - despite winning more often!)

**Breakeven win rate** = 1 / (1 + R:R). At 1:2 you only need **33%** winners; at 1:3, **25%**.

**Lessons:** a high win rate is not the goal - positive expectancy is. Avoid taking small profits quickly while letting losers run (the most common beginner pattern - it destroys expectancy). Costs (spread, commission, swap) reduce your real R:R, especially on exotic pairs.

You need a **sample** to know your expectancy - 10 trades proves nothing; 50-100+ journaled trades starts to mean something. The journal on the Trading Floor calculates win rate, profit factor and expectancy for you.
@terms
- Reward:risk ratio :: Potential profit divided by potential loss
- R multiple :: Result expressed in units of the amount risked
- Expectancy :: Average result per trade over many trades
- Breakeven win rate :: Win rate needed to break even at a given reward:risk
- Profit factor :: Gross profit divided by gross loss (above 1 = profitable)
@pro
- "I care about positive expectancy over 100 trades, not about winning the next one."
@quiz
?= Stop 25 pips, target 75 pips. Reward:risk = 1:?
= 3
> Reward:risk = target distance / stop distance = 75 / 25 = 3, so 1:3.
?= What win rate do you need to break even with 1:3 reward:risk? (percent)
= 25 | 25%
> 1 / (1 + 3).
? Which system is profitable?
+ 40% win rate, average win 2R, average loss 1R
- 70% win rate, average win 0.3R, average loss 1R
- 50% win rate, average win 0.5R, average loss 1R
- 90% win rate, average win 0.05R, average loss 1R
> 0.4x2 - 0.6x1 = +0.2R.

=== lesson f08-3 | Drawdowns, Correlation and Survival Rules | 20
@analogy Losing 50% of your account is like falling into a hole twice as deep as you think: you have to climb back 100% just to stand where you started. That's why preventing deep holes matters more than climbing fast.
@objectives
- Calculate recovery needed after a drawdown
- Simulate losing streaks at different risk levels
- Avoid hidden risk from correlated trades
@body
**Drawdown math (the cruel truth):**
| Loss | Gain needed to recover |
|---|---|
| 10% | 11.1% |
| 25% | 33.3% |
| 50% | **100%** |
| 75% | 300% |

**Losing streaks are normal.** Even a good system with a 45% win rate will have runs of 8-10 losses at some point. At **1% risk**, 10 losses leaves ~**90%** of your account. At **10% risk**, 10 losses leaves ~**35%** - nearly impossible to recover. (See the Calculators tab.)

**Correlation:** EUR/USD and GBP/USD often move together. Buying both is close to doubling the same bet - 1% + 1% = really ~2% risk on "USD weakness". Same for USD/ZAR and USD/MXN in risk-off moves. Limit total open risk (e.g. **max 3-5% across all trades**).

**Survival rules (write them in your plan):**
1. Max 1% per trade, max 3-5% total open risk.
2. Every trade has a stop-loss set **before** entry; never widen it.
3. **Daily loss limit** (e.g. -3%) and **weekly limit** (-6%): stop trading when hit.
4. No adding to losing trades ("averaging down").
5. Never trade money you can't afford to lose; never borrow to trade.
@terms
- Drawdown :: Decline from an account's peak to a low point
- Losing streak :: Consecutive losing trades - normal and inevitable
- Correlation :: Tendency of two pairs to move together
- Daily loss limit :: Maximum loss after which you stop trading for the day
- Averaging down :: Adding to a losing position - a dangerous habit
@pro
- "A 50% drawdown needs a 100% gain to recover, so I cap risk long before that."
@quiz
?= After a 50% loss, what % gain is needed to get back to break-even?
= 100 | 100%
> Half the money must double.
? You buy EUR/USD and GBP/USD at 1% risk each. Your real exposure is...
+ closer to 2% on one idea (USD weakness), because the pairs are correlated
- 0% - they cancel out
- exactly 1%
- unlimited
> Correlated bets stack.
? Which is a survival rule?
+ Stop trading for the day after hitting the daily loss limit
- Double the size after each loss
- Remove stops when trades go against you
- Borrow money to recover losses
> Protect capital and emotions.

=== boss
?= R20,000 account, 1% risk, USD/ZAR stop 400 pips, R10 per pip per lot. Lots?
= 0.05
> R200 / (400 x R10) = 0.05.
? Which order of steps is correct?
+ Stop from the chart -> lot size from risk -> check reward:risk -> enter
- Pick lots -> squeeze stop -> enter -> hope
- Enter -> decide stop later
- Enter -> no stop -> add more if losing
> Plan before you click.
? A system wins 35% of trades with 1:3 reward:risk. Its expectancy is...
+ positive (+0.4R)
- negative
- exactly zero
- impossible to know
> 0.35x3 - 0.65 = 0.4.
? Risking 10% per trade is dangerous mainly because...
+ normal losing streaks create drawdowns too deep to recover
- brokers forbid it
- it lowers spreads
- it increases win rate
> Survival math.
`;
