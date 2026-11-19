import { chapter } from '../dsl.js';

export default chapter`
@chapter forex.f02 | Pairs, Pips, Lots and Spreads | 2
@story
Thabang points at the screen: "EUR/USD 1.08520 / 1.08528." Phemelo stares. "Which number do I pay? What's a pip? And what does 0.01 lots even mean?" Thabang grins: "This is the arithmetic of trading. Master it and you'll always know exactly what a trade can cost you."
@lab drill:pip | Forex maths drills

=== lesson f02-1 | Base, Quote, Bid, Ask - Reading a Price | 20
@analogy A currency pair is a shop price tag: the BASE is the item on the shelf, the QUOTE is the money in your wallet. "EUR/USD 1.0850" means one euro costs 1.0850 dollars. Buying the pair = buying euros, paying in dollars.
@objectives
- Identify base and quote currencies
- Explain going long and going short
- Read bid/ask prices and calculate the spread
@body
Currencies always trade in **pairs**: **BASE/QUOTE**.
- **EUR/USD = 1.0850** -> 1 EUR costs 1.0850 USD
- **USD/ZAR = 17.2000** -> 1 USD costs 17.20 ZAR
- **USD/JPY = 150.20** -> 1 USD costs 150.20 JPY

**Buying (going long)** the pair = you expect the **base to strengthen** against the quote (price goes up).
**Selling (going short)** = you expect the **base to weaken** (price goes down). In FX you can profit in both directions.

If you believe the rand will weaken, you **buy USD/ZAR** (more rands per dollar). If you think the rand will strengthen, you **sell USD/ZAR**.

**Two prices:** the **bid** (what the broker pays you when you **sell**) and the **ask** (what you pay when you **buy**). Ask is always higher. **Spread = ask - bid.**
EUR/USD 1.08520 / 1.08528 -> spread 0.8 pips. Every trade starts slightly negative by the spread.

**Pair categories:**
- **Majors** - with USD and a big economy: EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, USD/CAD, NZD/USD - tightest spreads
- **Minors/crosses** - no USD: EUR/GBP, EUR/JPY, GBP/JPY
- **Exotics** - with an emerging currency: **USD/ZAR**, EUR/ZAR, USD/TRY - wider spreads, bigger swings
@terms
- Base currency :: The first currency in a pair - the one you're buying or selling
- Quote currency :: The second currency - what the price is measured in
- Long :: Buy - profit if price rises
- Short :: Sell - profit if price falls
- Bid / Ask :: Sell price / buy price
- Major pair :: A pair with USD and another major currency, e.g. EUR/USD
- Exotic pair :: A pair with an emerging-market currency, e.g. USD/ZAR
@pro
- "I'm long USD/ZAR because I expect the rand to weaken against the dollar."
@quiz
? In GBP/USD, which is the base currency?
+ GBP
- USD
- Both
- Neither
> The first one.
? You think the rand will STRENGTHEN. What do you do with USD/ZAR?
- Buy it
+ Sell it
- Nothing - you can't trade that
- Buy EUR/USD
> Fewer rands per dollar = USD/ZAR falls.
? EUR/USD shows bid 1.08520 and ask 1.08530. At which price do you BUY?
- 1.08520
+ 1.08530
- 1.08525
- Any price
> Buy at the ask.
? USD/ZAR is a...
- major
- minor cross
+ exotic
- commodity
> Emerging-market currency.

=== lesson f02-2 | Pips and Pipettes | 20
@analogy A pip is the "cent" of the forex world - the standard small step a price takes. Prices are shown with one extra digit (the pipette), like petrol prices showing tenths of a cent.
@objectives
- Identify the pip for normal and JPY pairs
- Count pips between two prices
@body
A **pip** ("percentage in point") is the standard unit of price movement:
- Most pairs: **0.0001** (the **4th** decimal). EUR/USD 1.0850 -> 1.0875 = **25 pips**.
- **JPY pairs: 0.01** (the **2nd** decimal). USD/JPY 150.20 -> 150.70 = **50 pips**.
- USD/ZAR: 0.0001 too - but because the rand moves a lot, USD/ZAR often moves **1,000-2,500 pips** in a day (17.2000 -> 17.3500 = 1,500 pips). Exotic pip counts look huge - judge them by money, not pips.

Brokers quote one extra digit, the **pipette** (1/10 pip): EUR/USD 1.08527 - the last 7 is pipettes.

**Counting pips:** (price difference) / pip size.
- GBP/USD 1.2650 -> 1.2610 = 0.0040 / 0.0001 = **40 pips** (down)
- EUR/JPY 162.35 -> 163.10 = 0.75 / 0.01 = **75 pips**

**Gold (XAU/USD)** isn't a currency, but every broker offers it. Pip conventions for gold vary by broker (often 0.1 or 0.01) - always check the contract specification.
@terms
- Pip :: Standard price unit - 0.0001 for most pairs, 0.01 for JPY pairs
- Pipette :: One tenth of a pip - the extra decimal brokers show
- Contract specification :: Broker's document defining pip size, lot size and trading hours for an instrument
@pro
- "On JPY pairs a pip is the second decimal place, not the fourth."
@quiz
?= EUR/USD moves from 1.0850 to 1.0890. How many pips?
= 40
> 0.0040 / 0.0001.
?= USD/JPY moves from 150.20 to 150.85. How many pips?
= 65
> JPY pip = 0.01.
? What is a pipette?
+ One tenth of a pip
- Ten pips
- A JPY pip
- A broker fee
> The extra displayed decimal.

=== lesson f02-3 | Lots and Pip Value - How Much Money Is a Pip? | 25
@analogy Lots are bottle sizes of the same drink: a standard lot is the 2-litre bottle, a mini lot the 500 ml, a micro lot the 330 ml can. Each pip of price movement is a sip - the bigger the bottle, the bigger each sip in money.
@objectives
- Convert lots to units
- Calculate pip value in the quote currency and in your account currency
@body
| Lot | Lots | Units of base | Approx. pip value on EUR/USD |
|---|---|---|---|
| Standard | 1.00 | 100,000 | $10.00 |
| Mini | 0.10 | 10,000 | $1.00 |
| **Micro** | **0.01** | **1,000** | **$0.10** |

**Pip value (in the QUOTE currency) = pip size x units.**
- 1 lot EUR/USD: 0.0001 x 100,000 = **$10** per pip (quote is USD)
- 1 lot USD/JPY: 0.01 x 100,000 = **JPY 1,000** per pip -> at 150 = about **$6.67**
- 1 lot USD/ZAR: 0.0001 x 100,000 = **R10** per pip -> at 17.20 = about **$0.58**

**Convert to your account currency** if it differs from the quote: for a ZAR account trading EUR/USD, $10/pip x 17.20 = **R172 per pip per lot** - so a 0.10 lot moving 50 pips = R860.

Profit/loss = pips x pip value. 0.05 lots on GBP/USD (+$0.50/pip) gaining 80 pips = **+$40**.

The Trading Floor's order ticket calculates all of this live - but you must be able to do it in your head to spot mistakes. Drill it in the Exam Hall.
@terms
- Standard lot :: 100,000 units of the base currency
- Mini lot :: 10,000 units (0.10 lots)
- Micro lot :: 1,000 units (0.01 lots)
- Pip value :: Money gained or lost per pip for a given position size
@pro
- "On EUR/USD a standard lot is about ten dollars a pip, a micro lot about ten cents."
@quiz
?= How many units is 0.25 lots?
= 25000 | 25,000
> 0.25 x 100,000.
?= Pip value in USD of 0.10 lots on EUR/USD?
= 1 | 1.00 | $1
> 0.0001 x 10,000 = $1.
?= You hold 0.02 lots EUR/USD and gain 50 pips. Profit in USD?
= 10 | 10.00 | $10
> $0.20/pip x 50.
? Why is a USD/ZAR pip worth less in dollars than a EUR/USD pip for the same lot size?
+ Its pip value is in rands, and one rand is worth much less than one dollar
- Exotics have no pips
- Brokers discount exotics
- USD/ZAR uses 0.01 pips
> R10/pip per lot = about $0.58.

=== boss
? You BUY EUR/USD. Which outcome makes money?
+ The euro strengthens against the dollar
- The dollar strengthens against the euro
- The price falls
- The spread widens
> Long = base up.
?= GBP/JPY moves from 190.40 to 189.90. How many pips (as a positive number)?
= 50
> 0.50 / 0.01.
? Which lot size is best for a beginner's first live trades (after demo)?
+ Micro lots (0.01)
- Standard lots (1.00)
- 10 lots
- Whatever the account allows
> Smallest risk per pip.
? Spread = ?
+ Ask minus bid
- Bid minus ask
- Profit minus loss
- Pip value x lots
> Always positive.
?= A ZAR account holds 1.00 lot EUR/USD. With USD/ZAR at 17.00, what is one pip worth in rands?
= 170 | R170
> One pip on 1 lot of EUR/USD = $10; converted to rands at 17.00 that is R170 per pip.
`;
