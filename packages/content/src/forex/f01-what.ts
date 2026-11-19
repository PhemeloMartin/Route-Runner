import { chapter } from '../dsl.js';

export default chapter`
@chapter forex.f01 | What Forex Actually Is | 1
@sources BIS Triennial Central Bank Survey (FX turnover); EU/UK regulator CFD risk-warning disclosures; FSCA investor education
@story
Phemelo's friend shows off a screenshot: "R5,000 profit in one day trading forex! Join my VIP group for R999." Phemelo feels the pull - and the doubt. Thabang, the Trading Floor mentor, sits him down. "Before you risk a single rand, you'll understand what this market is, who you're trading against, and why most beginners lose. Then we practise on demo, with real data, for months."
@lab trading:floor | Trading Floor - look at real USD/ZAR data

=== lesson f01-1 | Currencies, Exchange Rates and the World's Biggest Market | 20
@analogy The forex market is a giant, never-closing money-changing booth at an international airport. Every traveller, company, bank and government that needs another currency comes to swap - and the price moves with how many people want each currency.
@objectives
- Explain what an exchange rate is
- Describe the size and structure of the FX market
- Explain why it trades 24 hours a day, 5 days a week
@body
**Forex (FX)** = the foreign exchange market, where currencies are swapped. An **exchange rate** is the price of one currency in another: if **USD/ZAR = 17.20**, one US dollar costs R17.20.

**Why currencies are exchanged (real economy first):**
- A South African importer buying phones from China needs dollars or yuan
- A German tourist visiting Cape Town needs rands
- Sasol earns dollars for exports and converts some to pay workers in rands
- Pension funds buy foreign shares; governments and central banks manage reserves
- **Speculators** (including retail traders like you would be) try to profit from price changes

**Size:** the FX market turns over **more than seven trillion US dollars per day** (BIS survey) - the biggest market on earth. Most of it is between big banks, funds and corporations. **Retail traders are a tiny fraction.**

**OTC and 24/5:** there's no central exchange building. Trading happens **over-the-counter** between banks electronically, following the sun: Sydney -> Tokyo -> London -> New York, from Sunday night to Friday night (SAST). That's why prices move while you sleep - and why weekend news can make Monday open with a **gap**.

**The rand (ZAR)** is one of the most traded emerging-market currencies - volatile and very sensitive to global risk mood, commodity prices and South African news. Look at real USD/ZAR on the Trading Floor: those daily moves are real ECB data.
@terms
- Forex (FX) :: The global market for exchanging currencies
- Exchange rate :: The price of one currency expressed in another
- Over-the-counter (OTC) :: Traded directly between parties, not on a central exchange
- Speculator :: Someone who trades to profit from price changes
- Gap :: A jump in price between one session's close and the next open
@pro
- "Forex is an over-the-counter market that trades 24 hours a day, five days a week."
@quiz
? If USD/ZAR = 17.20, what does one US dollar cost?
+ R17.20
- $17.20
- R1.72
- $0.17
> Base currency (USD) priced in the quote currency (ZAR).
? Why does forex trade 24 hours on weekdays?
+ Trading moves between financial centres in different time zones
- It's illegal to close
- Computers never sleep
- Only retail traders keep it open
> Sydney, Tokyo, London, New York.
? Who makes up MOST forex volume?
- Retail traders on phones
+ Banks, institutions and corporations
- Tourists
- Crypto exchanges
> Retail is a small slice.

=== lesson f01-2 | Who You Trade Against: Brokers, CFDs and the Retail Reality | 25
@analogy A retail forex broker is like a betting shop that also offers a real market. Many brokers take the other side of your trade. The odds aren't fixed against you like a casino - but costs, leverage and human psychology are, and most players leave poorer.
@objectives
- Explain how retail traders access forex (brokers, CFDs, spreads)
- Understand market-maker vs ECN/STP brokers
- Face the statistics honestly
@body
Retail traders don't trade directly with the interbank market. They open an account with a **broker** and usually trade **CFDs** (Contracts for Difference) or rolling spot FX: you never take delivery of the currency - you profit or lose on the **price difference** between opening and closing.

**How brokers earn:** the **spread** (difference between buy and sell price), **commissions**, and **swap** (overnight financing).
- **Market maker (dealing desk)** - the broker takes the other side of your trade.
- **ECN/STP (no dealing desk)** - passes orders to liquidity providers; usually tighter spreads plus commission.

**The honest numbers:** regulators in Europe and the UK force brokers to publish what percentage of their retail clients lose money on CFDs. These disclosures typically show **around 70-80% of retail accounts losing money**. South Africa has no single published figure, but there's no reason to expect better.

**Why most lose:** too much leverage, no stop-losses, no plan, overtrading, emotional decisions after losses, and costs eating small profits. **The good news:** every one of those is a skill or a habit - which is exactly what this stream trains, on demo money, before you ever risk real money.

**Rule in Route Runner:** trade demo for at least 3 months, journal 100+ trades, prove positive results with disciplined risk. If you can't make money on demo, real money won't fix it.
@terms
- Broker :: Company that gives retail traders access to the market
- CFD :: Contract for Difference - you trade the price change without owning the asset
- Spread :: Difference between the bid (sell) and ask (buy) price - a cost to you
- Market maker :: Broker that takes the opposite side of client trades
- ECN/STP :: Brokers that route orders to liquidity providers
@pro
- "Most retail CFD accounts lose money, so I'm proving consistency on demo before risking capital."
@interview A friend says forex is a quick way to get rich. How do you respond? :: I'd say it's a real market but a hard one: regulator disclosures show most retail CFD traders lose money, mainly from leverage, poor risk management and emotion. Treat it as a skill to learn slowly - education, a written plan, demo trading for months with strict risk of 1-2% per trade - and never trade money you can't afford to lose. And avoid anyone selling signals or promising returns.
@quiz
? When you trade a forex CFD you...
+ profit or lose on the price difference without owning the currency
- receive physical banknotes
- buy shares in a bank
- lend money to the government
> Contract for difference.
? Roughly what share of retail CFD accounts lose money according to EU/UK broker disclosures?
- About 10-20%
- About 40%
+ About 70-80%
- Nobody loses
> Published risk warnings.
? How does a market-maker broker differ from an ECN broker?
+ A market maker takes the other side of your trades
- A market maker charges no spread
- An ECN broker is unregulated
- There is no difference
> Dealing desk vs no dealing desk.

=== lesson f01-3 | Why Exchange Rates Move | 20
@analogy A currency is like a company's share price for a whole country. Good news (higher interest rates, strong exports, stable politics) makes investors want it - price up. Bad news (load-shedding, scandals, global panic) makes them sell - price down.
@objectives
- List the main drivers of exchange rates
- Explain risk-on/risk-off and safe havens
- Know what typically moves the rand
@body
Prices move because of **supply and demand** for each currency. Big drivers:
1. **Interest rates** - higher rates attract investors seeking yield -> currency tends to strengthen. Central banks (Fed, ECB, Bank of England, **SARB**) are the most important players.
2. **Inflation** - high inflation erodes value; central banks raise rates to fight it.
3. **Economic growth and data** - GDP, jobs, retail sales.
4. **Trade and commodities** - SA exports gold, platinum, coal and iron ore; higher commodity prices often help the rand.
5. **Politics and policy risk** - elections, credit-rating changes, power supply.
6. **Global risk mood** - **risk-on** (investors confident -> buy higher-yielding emerging currencies like ZAR) vs **risk-off** (fear -> buy **safe havens**: USD, JPY, CHF, gold). The rand usually **weakens** (USD/ZAR rises) in global panics.
7. **Flows and sentiment** - positioning, big transactions, rumours.

Two ways to analyse: **fundamental analysis** (the economy and news - Chapter 7) and **technical analysis** (price charts and patterns - Chapters 5-6). Most professionals combine both, with **risk management** (Chapter 8) above everything.
@terms
- Interest rate differential :: Difference in rates between two countries - drives capital flows
- Risk-on / risk-off :: Market mood: seeking return vs seeking safety
- Safe-haven currency :: Currency bought in times of fear (USD, JPY, CHF)
- SARB :: South African Reserve Bank - sets SA's repo rate
- Fundamental analysis :: Analysing economic data, policy and news
- Technical analysis :: Analysing price charts and patterns
@pro
- "In risk-off episodes the rand usually weakens as investors move into safe havens like the dollar."
@quiz
? A global crisis frightens investors. What usually happens to USD/ZAR?
+ It rises (the rand weakens)
- It falls (the rand strengthens)
- It never changes
- Trading stops
> Risk-off hurts emerging-market currencies.
? A central bank unexpectedly RAISES interest rates. The usual first reaction of its currency?
+ It strengthens
- It weakens
- No effect
- It is delisted
> Higher yield attracts capital (all else equal).
? Which are safe-haven currencies?
+ USD, JPY, CHF
- ZAR, TRY, BRL
- AUD, NZD
- MXN, INR
> Bought in fear.

=== boss
? What is forex mainly used for in the real economy?
+ Trade, travel, investment and hedging currency risk
- Only speculation
- Only by governments
- Only for crypto
> Speculation is a small part.
? Which cost do you pay every time you open a trade, even before price moves?
+ The spread
- The dividend
- The tax rebate
- The swap only on Fridays
> Bid/ask difference.
? Which body sets South Africa's interest rate?
+ SARB
- FSCA
- JSE
- SARS
> Monetary Policy Committee of the Reserve Bank.
? A beginner's best first step is...
+ learning and trading a demo account with strict risk rules
- borrowing money to trade live
- buying a signals group
- using maximum leverage to grow fast
> Learn first and practise on a demo account with strict risk rules - real money comes much later, if ever.
`;
