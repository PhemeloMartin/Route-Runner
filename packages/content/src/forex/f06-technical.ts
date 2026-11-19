import { chapter } from '../dsl.js';

export default chapter`
@chapter forex.f06 | Technical Analysis: Trends, Levels and Indicators | 6
@story
"Technical analysis isn't fortune-telling," Thabang says. "It's reading where buyers and sellers have fought before, which side is winning, and where you'd be wrong. Simple tools, used consistently, beat complicated ones used randomly."
@lab trading:floor | Bar replay: practise identifying trend and levels

=== lesson f06-1 | Trend and Market Structure | 25
@analogy An uptrend is someone climbing stairs: each step (high) is higher than the last, and each rest stop (low) is higher too. When they put a foot LOWER than the last rest stop, the climb may be over.
@objectives
- Identify uptrends, downtrends and ranges using swing highs and lows
- Recognise a break of structure
- Draw trendlines and channels
@body
**Market structure:**
- **Uptrend** - **higher highs (HH) and higher lows (HL)**. Look to buy pullbacks.
- **Downtrend** - **lower highs (LH) and lower lows (LL)**. Look to sell rallies.
- **Range (sideways)** - roughly equal highs and lows. Buy near the bottom, sell near the top - or stand aside.

A **break of structure** happens when an uptrend makes a lower low (or a downtrend a higher high) - an early warning that the trend may be changing.

**Trendlines** connect at least two swing lows (uptrend) or highs (downtrend); a third touch confirms them. **Channels** add a parallel line on the other side. Don't force lines - if you have to squint, it isn't there.

"**The trend is your friend**" - most beginner losses come from trying to catch tops and bottoms against the trend. Trade **with** the higher-timeframe trend.

The Trading Floor shows a simple trend label (uptrend/downtrend/range) computed from moving averages - compare it with your own reading of highs and lows.
@terms
- Higher high / higher low :: Swing points defining an uptrend
- Lower high / lower low :: Swing points defining a downtrend
- Range :: Sideways market between support and resistance
- Break of structure :: Price breaking the latest swing point against the trend
- Trendline :: Line connecting swing lows (or highs) to show trend direction
@pro
- "As long as price keeps making higher lows, I treat the trend as up and buy pullbacks."
@quiz
? Higher highs and higher lows describe...
+ an uptrend
- a downtrend
- a range
- a gap
> Climbing stairs.
? In a downtrend, the usual approach is to...
+ sell rallies (pullbacks up)
- buy every dip
- buy breakouts to new lows
- ignore the trend
> Trade with the trend.
? An uptrend suddenly makes a lower low. This is...
+ a break of structure - a warning the trend may be changing
- proof the uptrend is stronger
- impossible
- a swap event
> Early reversal signal.

=== lesson f06-2 | Support, Resistance and Fibonacci | 25
@analogy Support is a floor where buyers keep catching a falling ball; resistance is a ceiling where sellers keep swatting it down. When a floor finally breaks, it often becomes the new ceiling - like a broken floor in a house becoming the ceiling of the room below.
@objectives
- Identify support and resistance zones
- Explain role reversal (polarity)
- Use Fibonacci retracements for pullback entries
@body
**Support** - a price zone where buying repeatedly stopped declines. **Resistance** - where selling repeatedly stopped rallies. Think **zones**, not exact lines. The more touches and the higher the timeframe, the stronger the level. **Round numbers** (USD/ZAR 18.0000, EUR/USD 1.1000) often act as psychological levels.

**Role reversal:** broken resistance often becomes support (and broken support becomes resistance). A classic setup: **breakout, then retest** of the broken level, then continuation.

**Fibonacci retracements** - after a swing move, pullbacks often pause around **38.2%, 50% and 61.8%** of the move. Draw from swing low to swing high in an uptrend; look for buy signals (a hammer, an engulfing) where a Fib level lines up with a support zone - **confluence**.

**Pivot points** - floor-trader levels calculated from yesterday's high, low and close (P, R1-R3, S1-S3), used mostly by day traders. The engine has the formula built in.

On the Trading Floor, **Support/Resistance** auto-draws zones where price has turned several times - check whether you agree.
@terms
- Support :: Price zone where demand has repeatedly stopped declines
- Resistance :: Price zone where supply has repeatedly stopped rallies
- Role reversal :: Broken resistance becoming support (and vice versa)
- Fibonacci retracement :: Pullback levels at 38.2%, 50%, 61.8% of a prior move
- Confluence :: Several reasons lining up at the same price
@pro
- "My best entries come from confluence - a support zone, a Fibonacci level and a candlestick signal at the same price."
@quiz
? After price breaks above resistance, that level often...
+ becomes support on a retest
- disappears forever
- becomes stronger resistance
- turns into a pivot point automatically
> Role reversal.
? Which are the most watched Fibonacci retracement levels?
+ 38.2%, 50%, 61.8%
- 10%, 20%, 30%
- 25%, 75%, 100%
- 1%, 2%, 3%
> Golden-ratio related.
? Confluence means...
+ several independent reasons pointing to the same level
- trading every signal
- using maximum leverage
- two brokers at once
> Stacked evidence.

=== lesson f06-3 | Indicators: Moving Averages, RSI, MACD, Bollinger, ATR | 30
@analogy Indicators are the car's dashboard gauges, calculated from price. The speedometer (RSI) shows how fast price is moving; cruise-control (moving averages) shows the average speed. Gauges help - but you still steer by looking through the windscreen (price).
@objectives
- Use moving averages for trend and dynamic support
- Interpret RSI, MACD, Bollinger Bands and ATR
- Avoid indicator overload
@body
**Every indicator is just a formula on past prices - none predicts the future.**
- **Moving averages** - **SMA** (simple average of the last N closes) and **EMA** (more weight on recent prices). Price above a rising 50/200-day MA = uptrend context. The **20 and 50 SMA** are drawn on the Trading Floor. MAs act as **dynamic support/resistance** in trends. **Golden cross** = 50 crosses above 200; **death cross** = below.
- **RSI (14)** - momentum from 0 to 100. Above **70 "overbought"**, below **30 "oversold"**. In strong trends RSI can stay overbought for weeks - it's not an automatic sell signal. **Divergence** (price makes a new high, RSI makes a lower high) warns momentum is fading.
- **MACD (12, 26, 9)** - difference between two EMAs plus a signal line; crossovers and the histogram show momentum shifts.
- **Bollinger Bands (20, 2)** - a 20 SMA with bands 2 standard deviations away; bands **squeeze** before big moves and expand during them.
- **ATR (14)** - Average True Range: how far price normally moves per candle. Use it to place stops beyond normal noise (e.g. 1.5 x ATR) - it's the most practical indicator for risk management.

**Keep it simple:** one trend tool (MA), one momentum tool (RSI), one volatility tool (ATR) + price action is plenty. Five oscillators that all say the same thing is just noise.
@terms
- SMA / EMA :: Simple / exponential moving average of closing prices
- RSI :: Relative Strength Index - momentum oscillator from 0 to 100
- Divergence :: Price and an oscillator moving in opposite directions - weakening momentum
- MACD :: Moving Average Convergence Divergence - momentum indicator from two EMAs
- Bollinger Bands :: Volatility bands around a moving average
- ATR :: Average True Range - average candle range, used for stop placement
@pro
- "I place stops using ATR so normal market noise doesn't knock me out."
@interview RSI is at 78 on USD/ZAR. Do you sell? :: Not on that alone. RSI above 70 means strong upward momentum, and in a strong trend it can stay overbought for a long time. I'd look at structure and levels: is price at major resistance, is there bearish divergence or a rejection candle, what's the higher-timeframe trend? Only with confluence, a defined stop and proper position size would I consider a short.
@quiz
? RSI above 70 is traditionally called...
+ overbought
- oversold
- neutral
- a golden cross
> But not an automatic sell.
? Which indicator measures volatility and helps set stop distance?
- RSI
+ ATR
- MACD histogram only
- Volume profile
> Average True Range.
? A "golden cross" is when...
+ the 50-period MA crosses above the 200-period MA
- RSI crosses 50
- price touches a Bollinger band
- ATR doubles
> Bullish long-term signal.
? Price makes a higher high but RSI makes a lower high. This is...
+ bearish divergence
- bullish divergence
- a breakout confirmation
- a swap
> Weakening momentum.

=== boss
? Which is the strongest technical long setup?
+ Uptrend on the daily, pullback to a support zone + 61.8% Fib, bullish engulfing candle
- Random buy because RSI is 50
- Buying because of a forum tip
- Buying the high of a downtrend
> Confluence with the trend.
? In a strong uptrend, RSI stays above 70 for weeks. What does that show?
+ Overbought can persist in strong trends - not a timing signal by itself
- The data is wrong
- Price must crash tomorrow
- RSI is broken
> Momentum confirms trend.
? Where are support and resistance best thought of?
+ As zones
- As exact single prices
- Only as round numbers
- Only on 1-minute charts
> Zones on higher timeframes.
? Which combination avoids indicator overload?
+ One trend tool, one momentum tool, one volatility tool plus price action
- Ten oscillators
- No chart at all
- Only news headlines
> Keep it simple.
`;
