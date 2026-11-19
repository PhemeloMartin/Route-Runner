import { chapter } from '../dsl.js';

export default chapter`
@chapter forex.f09 | Trading Psychology, Your Trading Plan and Backtesting | 9
@story
Phemelo loses three demo trades in a row and immediately opens a fourth, twice as big, "to win it back". Thabang closes the laptop gently. "That feeling - that's the real enemy. Not the market. Today you write a plan that protects you from yourself, and you learn to test ideas on history before trusting them."
@lab trading:floor | Bar replay: 20 journaled trades following your plan

=== lesson f09-1 | The Emotional Traps | 20
@analogy Trading emotions are like driving while angry. You know the rules of the road perfectly - but anger makes you speed, tailgate and take risks you'd never take calmly. The rules only help if you follow them when emotions are loud.
@objectives
- Recognise fear, greed, FOMO, revenge trading and overconfidence
- Use practical techniques to stay disciplined
@body
**The classic traps:**
- **FOMO (fear of missing out)** - jumping into a move that already ran, with no setup.
- **Revenge trading** - trading bigger or more after a loss to "win it back". The #1 account killer.
- **Fear** - closing winners too early, skipping valid setups after losses.
- **Greed** - removing take-profits, adding to positions, risking more after wins.
- **Overconfidence** after a winning streak - bigger size, looser rules.
- **Hope** - moving the stop-loss further away so a loser "has room". It never ends well.
- **Overtrading / boredom trading** - taking trades because you're at the screen, not because there's a setup.
- **Confirmation bias** - only seeing information that supports your position.

**What actually helps:**
- A written **plan** with **if-then rules** decided while calm.
- **Fixed risk** (1%) so no single trade matters emotionally.
- **Daily loss limit** - walk away when hit.
- **Journal the emotion** for every trade (the Trading Floor asks "How do I feel right now?"). After 30 trades you'll see your own patterns - e.g. "my FOMO trades lose 80% of the time".
- **Process goals** ("follow my plan on every trade") instead of money goals ("make R1,000 today").
- Sleep, exercise, and not trading when stressed or tired.
@terms
- FOMO :: Fear of missing out - chasing moves without a setup
- Revenge trading :: Trading to win back a loss - usually bigger and impulsive
- Overtrading :: Taking too many low-quality trades
- Confirmation bias :: Noticing only information that supports what you already believe
- Process goal :: A goal about following your rules, not about profit
@pro
- "After hitting my daily loss limit I stop - revenge trading is how small losses become big ones."
@quiz
? After a loss you immediately open a bigger trade to win it back. This is...
+ revenge trading
- position sizing
- a process goal
- hedging
> The classic account killer.
? Moving your stop-loss further away because "it will come back" is driven by...
+ hope
- discipline
- risk management
- confluence
> Never widen a stop.
? Which goal is a healthy process goal?
+ Follow every rule in my plan on every trade this week
- Make R5,000 this week
- Win 10 trades in a row
- Double the account this month
> Control what you can control.

=== lesson f09-2 | Writing Your Trading Plan | 25
@analogy A trading plan is a pilot's pre-flight checklist. Experienced pilots still use it on every flight - not because they're beginners, but because checklists stop tired, stressed humans from making fatal mistakes.
@objectives
- Write a complete trading plan
- Define exact entry, exit and risk rules
@body
**Your plan (fill this in and keep it next to the screen):**
1. **Why I trade & goals** - e.g. "Learn a skill; prove 3 months of disciplined demo results."
2. **Markets** - e.g. EUR/USD, GBP/USD, USD/ZAR (max 3-4 to start).
3. **Timeframes** - direction from D1, entries on D1/H4.
4. **When** - sessions I trade; days/times I don't (major news, Friday evening).
5. **Setup (entry rules)** - written so precisely that someone else could follow them: *"Daily uptrend (price above rising 50 SMA, higher lows). Price pulls back into a support zone or the 50 SMA. A bullish engulfing or hammer closes there. Enter at the next open."*
6. **Stop-loss rule** - below the signal candle's low or 1.5 x ATR, whichever is further.
7. **Take-profit rule** - at the next resistance, minimum 1:2 R:R or skip the trade.
8. **Trade management** - move stop to break-even after +1R? partial close? (decide in advance)
9. **Risk rules** - 1% per trade, max 3 open trades, -3% daily / -6% weekly stop.
10. **Routine** - pre-session calendar check; post-trade journal; weekly review every Sunday.
11. **Graduation criteria** - only consider small real money after 100+ demo trades, positive expectancy, max drawdown under 10%, rules followed 90%+ of the time.

If you can't write your setup in a few precise sentences, you don't have a setup yet - you have a feeling.
@terms
- Trading plan :: A written rulebook covering markets, setups, risk and routine
- Entry rules :: Exact conditions that must be true to open a trade
- Trade management :: Rules for handling an open trade (break-even, partials)
- Weekly review :: Regular analysis of your journal and plan adherence
@pro
- "My entry rule is specific enough that another trader could take the same trade from my plan."
@interview What's in your trading plan? :: Markets and timeframes, exact entry conditions, stop and target rules with a minimum 1:2 reward:risk, 1% risk per trade with daily and weekly loss limits, rules about news, a pre-session routine and journaling, and objective criteria I must meet on demo before trading real money.
@quiz
? Which entry rule is precise enough?
+ Daily uptrend above the 50 SMA, bullish engulfing at support, enter next open
- Buy when it looks good
- Buy when the group says so
- Buy when I feel lucky
> Specific and repeatable.
? What should happen if a setup offers only 1:0.8 reward:risk and your plan requires 1:2?
+ Skip the trade
- Take it with double size
- Remove the take-profit
- Move the stop closer to force 1:2
> Rules are rules.
? When should graduation criteria to real money be defined?
+ In advance, in the written plan
- After a big win
- After a big loss
- Never
> Decide calmly.

=== lesson f09-3 | Backtesting, Bar Replay and Forward Testing | 25
@analogy Backtesting is watching recordings of past matches to see if your game plan would have worked. Forward testing on demo is playing friendlies. Only after both do you play for the trophy (real money).
@objectives
- Backtest a rule set honestly with bar replay
- Measure results with the right statistics
- Avoid curve-fitting and look-ahead bias
@body
**Backtesting** - applying your exact rules to historical data. **Bar replay** (Trading Floor -> "Bar replay") hides the future: you see candles one at a time, make decisions, and only then press **Next bar**. This is the closest thing to real trading without risk - and with real ECB data.

**How to backtest properly:**
1. Write the rules first (from your plan) - don't change them mid-test.
2. Choose a period and pair; replay bar by bar.
3. Log every signal: date, entry, stop, target, result in R, notes.
4. Collect **at least 30-50 trades** (more is better) across different market conditions (trends AND ranges).
5. Calculate: win rate, average R, **expectancy**, **max drawdown**, longest losing streak, profit factor.

**Biases that lie to you:**
- **Look-ahead bias** - peeking at future candles (that's why replay hides them).
- **Curve-fitting / over-optimisation** - tweaking rules until they fit the past perfectly; they then fail in the future. Keep rules simple; test on a different period than you designed on.
- **Cherry-picking** - only counting the "obvious" trades.
- **Ignoring costs** - include spread (wide on USD/ZAR) and swaps.

**Forward testing** - trade the plan live on **demo** for weeks/months. If results match the backtest (roughly), you have evidence. If not, find out why before going further.
@terms
- Backtesting :: Testing rules on historical data
- Bar replay :: Revealing historical candles one at a time to practise without hindsight
- Look-ahead bias :: Using information that wouldn't have been available at the time
- Curve-fitting :: Over-tuning rules to past data so they fail on new data
- Forward testing :: Trading the plan in real time on demo to validate a backtest
- Max drawdown :: Largest peak-to-trough decline during a test
@pro
- "I backtest with bar replay to avoid look-ahead bias, then forward-test on demo before trusting a strategy."
@quiz
? Peeking at future candles while backtesting causes...
+ look-ahead bias
- slippage
- swap charges
- margin calls
> Bar replay prevents it.
? How many trades make a backtest start to be meaningful?
- 3
- 10
+ 30-50 or more
- 1
> Small samples are noise.
? Tweaking a strategy until it fits the past perfectly is called...
+ curve-fitting (over-optimisation)
- forward testing
- position sizing
- hedging
> Fails on new data.

=== boss
? You hit your daily loss limit at 11:00. The professional action is...
+ Stop trading for the day and review in the journal
- Double the next position
- Switch to a more volatile pair
- Remove stops to avoid more losses
> Rules protect you.
? Which belongs in a trading plan?
+ Exact entry, stop and target rules plus risk limits
- Your friend's signals
- Lottery numbers
- Only profit targets
> A complete rulebook.
? What's the main benefit of journaling emotions?
+ Revealing personal patterns, like FOMO trades losing more often
- It increases leverage
- It reduces spreads
- It's required by brokers
> Self-knowledge.
? A strategy looked amazing in backtest but fails on demo. A likely cause?
+ Curve-fitting or look-ahead bias in the backtest
- Demo accounts never work
- The broker is always cheating
- Too little leverage
> Honest testing matters.
`;
