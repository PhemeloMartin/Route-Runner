import { chapter } from '../dsl.js';

export default chapter`
@chapter forex.f05 | Reading Charts and Candlesticks | 5
@story
Thabang opens the real weekly EUR/USD chart - the same candles that stand as green and red pillars beside the Trading Floor in the 3D world. "Every candle is a story of a battle between buyers and sellers. Learn to read the stories and the chart starts talking to you."
@lab trading:floor | Turn on "Candle patterns" on the Trading Floor chart

=== lesson f05-1 | Line, Bar and Candlestick Charts | 20
@analogy A candlestick is a one-day weather report in a single symbol: where the temperature started (open), its highest and lowest points (high/low), and where it ended (close). Green day = it got warmer; red day = it got colder.
@objectives
- Read OHLC from a candlestick
- Distinguish bullish and bearish candles
- Interpret bodies and wicks
@body
**Line chart** - joins the closing prices. Clean, good for the big picture.
**Bar (OHLC) chart** - vertical line from low to high, tick left = open, tick right = close.
**Candlestick chart** (Japanese, 1700s rice traders) - the standard:
- **Body** - between **open** and **close**. **Green/white = bullish** (close above open). **Red/black = bearish** (close below open).
- **Wicks (shadows)** - lines above and below the body to the **high** and **low**.

**Reading the battle:**
- **Big body, small wicks** - one side dominated all period (strong momentum).
- **Long lower wick** - sellers pushed price down, buyers fought back hard (rejection of lower prices).
- **Long upper wick** - buyers pushed up, sellers slammed it back (rejection of higher prices).
- **Tiny body, wicks both sides** - indecision.

**About Route Runner's data:** the ECB publishes one reference rate per day, so our daily candle's open is the previous fix and its close is today's fix; weekly candles are built from the daily fixes. Real broker candles also capture intraday highs and lows, so their wicks are longer - the reading skills are identical.
@terms
- OHLC :: Open, High, Low, Close - the four prices in a candle or bar
- Candle body :: The part between open and close
- Wick (shadow) :: Thin line showing the high or low beyond the body
- Bullish candle :: Close higher than open (usually green)
- Bearish candle :: Close lower than open (usually red)
@pro
- "A long lower wick at support shows buyers rejecting lower prices."
@quiz
? A candle's close is above its open. It is...
+ bullish
- bearish
- a doji by definition
- invalid
> Usually drawn green.
? What does a long UPPER wick usually show?
+ Buyers pushed price up but sellers rejected it
- Strong buying all period
- No trading occurred
- A gap
> Rejection of higher prices.
? Which chart type shows only closing prices joined by a line?
+ Line chart
- Candlestick chart
- Bar chart
- Renko chart
> Simplest view.

=== lesson f05-2 | Candlestick Patterns That Matter | 25
@analogy Candlestick patterns are facial expressions of the market. A hammer at the bottom of a fall is someone getting back up after being knocked down. One expression doesn't tell you everything - but in the right context it's a strong hint.
@objectives
- Recognise doji, hammer, shooting star, engulfing, inside bar and marubozu
- Explain why location (context) matters more than the pattern
@body
| Pattern | Looks like | Suggests | Where it matters |
|---|---|---|---|
| **Doji** | open = close, cross shape | indecision | after a strong move |
| **Hammer** | small body at top, long lower wick | bullish rejection | at **support** after a fall |
| **Shooting star** | small body at bottom, long upper wick | bearish rejection | at **resistance** after a rise |
| **Bullish engulfing** | green body fully engulfs previous red body | buyers take over | at support |
| **Bearish engulfing** | red body engulfs previous green body | sellers take over | at resistance |
| **Inside bar** | whole candle inside the previous one's range | contraction, breakout coming | anywhere - trade the break |
| **Marubozu** | big body, almost no wicks | strong momentum | continuation |

**The most important rule: context beats pattern.** A hammer in the middle of nowhere means little. A hammer **at a strong support level, in an uptrend, on the daily chart** is a high-quality signal. Always ask: *where* is it, and what's the bigger trend?

Patterns are **probabilities, not promises**. They fail often - which is why every trade still needs a stop-loss (usually beyond the pattern's wick).

Switch on **"Candle patterns"** on the Trading Floor: the engine marks patterns on real data. Use **bar replay** to check what happened *after* each one.
@terms
- Doji :: Candle with almost equal open and close - indecision
- Hammer :: Small body with long lower wick - bullish rejection at support
- Shooting star :: Small body with long upper wick - bearish rejection at resistance
- Engulfing pattern :: Candle whose body fully covers the previous body - momentum shift
- Inside bar :: Candle within the previous candle's range - consolidation
@pro
- "I only act on a candlestick signal when it forms at a key level in the direction of the higher-timeframe trend."
@quiz
? A hammer is most meaningful...
+ at support after a decline
- in the middle of a range
- at resistance after a rise
- on any random candle
> A hammer means buyers rejected lower prices - that matters most at a support level after a decline.
? A large red candle completely covers the previous green candle's body at resistance. This is...
+ a bearish engulfing pattern
- a hammer
- a doji
- an inside bar
> Sellers took control.
? Where would you typically place a stop-loss for a long trade from a hammer?
+ Just below the hammer's low
- Above the hammer's high
- No stop needed
- At the open of the next candle
> Beyond the wick that proved the rejection.

=== boss
? Which candle signals indecision?
+ Doji
- Marubozu
- Bullish engulfing
- Gap
> Open about equal to close.
? A shooting star appears at a resistance level after a strong rally. A trader expecting a reversal would consider...
+ selling, with a stop above the wick
- buying, with no stop
- doubling leverage
- ignoring all resistance
> Bearish rejection.
? What do the wicks of a candle show?
+ The high and low reached during the period
- The spread
- The volume
- The swap
> Extremes of the period.
? Why must patterns always be used with stop-losses?
+ Patterns are probabilities and fail often
- Brokers require two stops
- Patterns guarantee profit
- Stops increase the win rate to 100%
> Manage the failures.
`;
