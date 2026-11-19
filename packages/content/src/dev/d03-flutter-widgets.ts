import { chapter } from '../dsl.js';

export default chapter`
@chapter dev.d03 | Flutter 1: Everything Is a Widget | 3
@sources docs.flutter.dev - Flutter architectural overview, layout ("Understanding constraints"), widget catalog; dart.dev language tour; Flutter Material 3 guidelines
@story
Lindiwe's customers use everything from a R1 200 Android to an iPhone, and some order from a laptop. Building three separate apps would cost three times as much. Flutter lets Phemelo write ONE Dart codebase that compiles to Android, iOS, web and desktop - and it draws every pixel itself, so the app looks identical everywhere. Time to build the Kasi Market app.
@lab dev:flutter-first | Flutter Mission - create, change and run the Kasi Market app

=== lesson d03-1 | How Flutter Works: Widgets, Hot Reload and the Three Trees | 25
@analogy Widgets are LEGO instructions, not the bricks themselves. Every time something changes you hand Flutter a fresh, cheap set of instructions (rebuild), and Flutter compares them with the model already standing on the table and only swaps the bricks that actually changed.
@objectives
- Explain what Flutter is and how it differs from native and web apps
- Describe widgets, the build method and the widget/element/render trees
- Create and run a project with the Flutter CLI
@body
**Flutter** (by Google, open source) is a UI toolkit: one **Dart** codebase -> Android, iOS, web, Windows, macOS, Linux. Unlike apps that wrap native buttons, Flutter **paints every pixel itself** with its rendering engine (**Impeller** is now the default on iOS and modern Android), so your UI looks the same on every device.

**Everything is a widget**: text, padding, a button, a whole screen, even the app. Widgets are small, immutable *descriptions* of UI. You compose them in a tree:
~~~
MaterialApp
 └─ Scaffold
     ├─ AppBar  (title: Text('Kasi Market'))
     ├─ body: Center
     │         └─ Column
     │             ├─ Text('You have pushed the button...')
     │             └─ Text('0')
     └─ FloatingActionButton (child: Icon(Icons.add))
~~~
Each widget has a **build(BuildContext context)** method that returns more widgets. Flutter keeps three trees:
- **Widget tree** - your cheap, throw-away descriptions (rebuilt often).
- **Element tree** - long-lived objects that remember *where* each widget is and hold State.
- **RenderObject tree** - does layout and painting (expensive, so Flutter reuses it).
When you rebuild, Flutter **diffs** new widgets against the elements and only updates what changed - that's why rebuilding is fast.

**The CLI** you'll use daily:
~~~
flutter doctor            # checks SDKs, Android toolchain, Chrome, connected devices
flutter create kasi_market   # names must be lower_snake_case
cd kasi_market
flutter run -d chrome     # or an emulator / USB phone
# while running:  r = hot reload (keeps state)   R = hot restart (resets state)
~~~
**Hot reload** injects your changed Dart code into the running app in about a second *and keeps the current state* (the counter stays at 5). **Hot restart** reruns main() from scratch. A full rebuild is only needed for native changes (new plugins, AndroidManifest edits).

Project layout: [[lib/main.dart]] (your code), [[pubspec.yaml]] (name, version, dependencies, assets), [[test/]] (tests), [[android/]] [[ios/]] [[web/]] (platform shells you rarely touch).
@terms
- Flutter :: Google's open-source UI toolkit: one Dart codebase for mobile, web and desktop
- Widget :: An immutable description of part of the UI; everything in Flutter is a widget
- build method :: Returns the widgets that make up this widget; runs whenever it must rebuild
- BuildContext :: A widget's location in the tree, used to look up theme, navigation, providers
- Element tree :: Long-lived objects linking widgets to their position and State
- Hot reload :: Inject changed code into the running app while keeping state
- Hot restart :: Restart the app's Dart code from main(), resetting state
- pubspec.yaml :: Flutter project file: name, version, dependencies, assets
- Impeller :: Flutter's modern rendering engine that draws every pixel
@pro
- "Flutter widgets are immutable descriptions; Flutter diffs them against the element tree so rebuilds are cheap."
- "Hot reload keeps state; hot restart resets it; native changes need a full rebuild."
@interview Why might a company choose Flutter over building separate native Android and iOS apps? :: One Dart codebase and one team ship to Android, iOS and web, which cuts cost and keeps features in sync. Flutter draws its own UI, so the design is pixel-identical across devices, and hot reload makes UI development very fast. Release builds are AOT-compiled to native code, so performance is close to native. The trade-offs are a larger app size than a minimal native app and needing platform channels for very new or unusual native APIs.
@lab dev:flutter-first
@quiz
? What does Flutter use to draw its UI?
- The platform's native buttons
+ Its own rendering engine that paints every pixel
- A hidden web browser
- Java Swing
> That's why Flutter apps look the same everywhere.
? You change a Text label and press r. What happens?
+ Hot reload - the change appears in about a second and the app keeps its state
- The app restarts and the counter resets to 0
- Nothing until you reinstall
- The phone reboots
> r = hot reload (state kept); R = hot restart.
? Which file lists a Flutter app's package dependencies?
- main.dart
+ pubspec.yaml
- AndroidManifest.xml
- package.json
> pubspec.yaml holds name, version, dependencies and assets.
? Which name is valid for flutter create?
- KasiMarket
- kasi-market
+ kasi_market
- 2kasi
> Dart package names are lower_snake_case and start with a letter.

=== lesson d03-2 | Stateless vs Stateful Widgets | 25
@analogy A StatelessWidget is a printed poster: it shows whatever it was given and never changes by itself. A StatefulWidget is a scoreboard at a soccer match: the frame stays, but the score (state) changes - and every time someone updates it with setState, the board is redrawn.
@objectives
- Choose between StatelessWidget and StatefulWidget
- Update the UI correctly with setState
- Pass data into widgets with constructors and use const
@body
~~~
class PriceTag extends StatelessWidget {
  const PriceTag({super.key, required this.cents});
  final int cents;                       // data comes IN through the constructor

  @override
  Widget build(BuildContext context) {
    return Text('R ' + (cents / 100).toStringAsFixed(2));
  }
}

class CartButton extends StatefulWidget {
  const CartButton({super.key});
  @override
  State<CartButton> createState() => _CartButtonState();
}

class _CartButtonState extends State<CartButton> {
  int _items = 0;                        // private state (underscore = private in Dart)

  void _add() {
    setState(() {                        // tell Flutter: data changed, call build() again
      _items++;
    });
  }

  @override
  Widget build(BuildContext context) {
    return FilledButton.icon(
      onPressed: _add,
      icon: const Icon(Icons.shopping_cart),
      label: Text('Cart ($_items)'),
    );
  }
}
~~~
Rules of thumb:
- **StatelessWidget** - everything it shows comes from its constructor (or from InheritedWidgets/providers above it). Most widgets should be stateless.
- **StatefulWidget** - it owns data that changes over time *and only it cares about* (a checkbox, an animation, a form field). The **State** object lives in the element tree, so it survives rebuilds.
- Change state **only inside setState(() { ... })**. Changing a variable without setState updates memory but not the screen - a classic beginner bug.
- **Lifecycle**: [[initState()]] (once, start timers/listeners), [[build()]] (many times - keep it fast, no network calls!), [[dispose()]] (clean up controllers and subscriptions to avoid memory leaks).
- **const** constructors ([[const Icon(Icons.add)]]) let Flutter reuse the widget instead of rebuilding it - free performance. The analyzer reminds you with the prefer_const_constructors lint.
- **Keys** help Flutter keep the right State attached when list items move or are deleted (use [[ValueKey(todo.id)]] in dynamic lists).
@terms
- StatelessWidget :: Widget whose output depends only on its inputs; has no mutable state
- StatefulWidget :: Widget paired with a State object holding data that changes over time
- State object :: Long-lived object that holds mutable data and builds the widget
- setState :: Tells Flutter the state changed so build() runs again
- initState :: Lifecycle method run once when the State is created
- dispose :: Lifecycle method to release controllers, streams and timers
- const constructor :: Builds a compile-time constant widget that Flutter can reuse
- Key :: Identity for a widget so Flutter matches State correctly when lists change
@pro
- "I keep widgets stateless by default and push state up or into a state-management solution."
- "build() must be pure and fast - no network calls inside it."
@interview A user taps "Add to cart" and the counter variable increases but the screen doesn't update. Why? :: The variable was changed outside setState, so Flutter was never told to rebuild the widget. Wrapping the change in setState schedules a rebuild and the new value appears. If the counter is needed by other screens, it shouldn't live in one widget's State at all - I'd lift it into a provider or other state-management object.
@quiz
? You change _items++ but forget setState. What happens?
- The app crashes
+ The value changes in memory but the screen doesn't update
- Flutter calls setState for you
- The widget is disposed
> setState is what triggers a rebuild.
? Where should you cancel a StreamSubscription or dispose a TextEditingController?
- build()
- initState()
+ dispose()
- main()
> dispose() cleans up to prevent memory leaks.
? Which widget type should a simple product price label usually be?
+ StatelessWidget
- StatefulWidget
- InheritedWidget only
- Isolate
> It only displays the price it is given.
?? Why mark widgets const where possible? (choose all)
+ Flutter can reuse them instead of rebuilding
+ It's a free performance win
- It makes them stateful
- It is required for hot reload
> const = compile-time constant, reused across rebuilds.

=== lesson d03-3 | Layout: Constraints, Rows, Columns and Lists | 30
@analogy Flutter layout is like a parent giving a child a box: "you may be between 0 and 360 pixels wide". The child chooses its size inside those limits and tells the parent, who then decides where to put it. Constraints go down, sizes go up, the parent sets the position.
@objectives
- Apply the rule: constraints go down, sizes go up, parent sets position
- Build layouts with Row, Column, Expanded, Padding, Stack and ListView
- Fix the famous "RenderFlex overflowed" and unbounded height errors
@body
**The one rule** (from Flutter's "Understanding constraints" guide): *constraints go down, sizes go up, parent sets position.* Almost every layout bug comes from forgetting it.

Core layout widgets:
| Widget | Use |
|---|---|
| **Row / Column** | Children side by side / stacked; [[mainAxisAlignment]], [[crossAxisAlignment]] |
| **Expanded / Flexible** | Child takes the remaining space in a Row/Column (flex ratios) |
| **Padding, SizedBox** | Space around / fixed gaps ([[SizedBox(height: 16)]]) |
| **Container** | Padding + colour + border + size in one (use it sparingly) |
| **Stack + Positioned** | Layers on top of each other (badge on an icon) |
| **ListView.builder** | Scrolling list that only builds visible items - essential for long lists |
| **GridView** | Product grids |
| **SafeArea** | Keeps content away from notches and status bars |

~~~
ListView.builder(
  itemCount: products.length,
  itemBuilder: (context, i) => ListTile(
    leading: const Icon(Icons.bakery_dining),
    title: Text(products[i].name),
    trailing: PriceTag(cents: products[i].priceCents),
  ),
)
~~~
**The two famous errors:**
- *"A RenderFlex overflowed by 42 pixels on the right"* (yellow-black stripes) - a Row's children want more width than exists. Wrap the long child in **Expanded** (or Flexible), allow text to wrap/ellipsize, or make it scrollable.
- *"Vertical viewport was given unbounded height"* - a ListView inside a Column has no height limit. Wrap the ListView in **Expanded** so it gets the remaining space.

**Responsive design**: use [[MediaQuery.sizeOf(context)]] or [[LayoutBuilder]] to switch between a phone list and a tablet/desktop grid. **Material 3** ([[ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: ...))]]) gives you a consistent colour system, dark mode and accessible contrast for free.

**Accessibility** matters: large enough tap targets (48x48), [[Semantics]] labels for icons, text that respects the user's font-size setting. In South Africa many users have older phones with small screens - test on a small emulator too.
@terms
- Constraints :: Min/max width and height a parent gives a child
- Row / Column :: Lay children out horizontally / vertically
- Expanded :: Makes a Row/Column child fill the remaining space
- ListView.builder :: Lazily builds only the visible items of a long scrolling list
- RenderFlex overflow :: Error when Row/Column children need more space than available
- Unbounded height :: Error when a scrolling widget gets no height limit (e.g. ListView in Column)
- SafeArea :: Insets content away from notches and system bars
- Material 3 :: Google's design system built into Flutter (colour schemes, components)
@pro
- "Constraints go down, sizes go up, and the parent sets the position."
- "Long lists always use ListView.builder so we only build what's on screen."
@interview Your screen shows yellow-and-black stripes saying a RenderFlex overflowed. How do you fix it? :: That's a Row or Column whose children need more space than they were given. I find the widget that is too big - often long text or an image in a Row - and wrap it in Expanded or Flexible so it takes only the remaining space, set maxLines with TextOverflow.ellipsis on text, or make the area scrollable. If it's a ListView inside a Column, the ListView needs Expanded to get bounded height.
@quiz
? A ListView inside a Column throws "unbounded height". The usual fix?
+ Wrap the ListView in Expanded
- Wrap the Column in a ListView
- Use setState
- Delete the Column
> Expanded gives the ListView the remaining, bounded height.
? Which widget efficiently shows 5 000 products?
- Column with 5 000 children
+ ListView.builder
- Stack
- Row
> builder only creates visible items.
? What is Flutter's layout rule?
+ Constraints go down, sizes go up, parent sets position
- Children decide their own position
- Sizes go down, constraints go up
- Everything is absolutely positioned
> Memorise it - it explains almost every layout bug.
? Which widget keeps content clear of a phone's notch and status bar?
- Padding
+ SafeArea
- Center
- Spacer
> SafeArea adds the needed insets.

=== boss
? Which tree holds a StatefulWidget's State between rebuilds?
- Widget tree
+ Element tree
- Render tree
- Dart VM tree
> Widgets are rebuilt; elements (and their State) persist.
? Where should a network request NOT be started?
+ Inside build()
- In initState() or a state-management class
- In a button's onPressed
- In a repository/service class
> build() can run many times per second.
? A Row with a long product name overflows. Best fix?
- Increase the phone's resolution
+ Wrap the Text in Expanded and use maxLines with ellipsis
- Replace Row with Stack
- Remove the text
> Expanded constrains it to the remaining width.
?? Which commands/keys reset the app's state? (choose all)
+ R (hot restart)
+ Stopping and running flutter run again
- r (hot reload)
- flutter pub get
> Hot reload keeps state; restart doesn't.
? Why can one Flutter codebase look identical on Android and iOS?
- It uses the OS widgets of each platform
+ Flutter renders every pixel itself with its own engine
- It converts to React Native
- It runs in a browser on both
> Own rendering engine (Impeller).
`;
