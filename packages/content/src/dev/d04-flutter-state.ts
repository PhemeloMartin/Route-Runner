import { chapter } from '../dsl.js';

export default chapter`
@chapter dev.d04 | Flutter 2: State, Navigation and Forms | 4
@sources docs.flutter.dev - State management (options and the simple app state guide), Navigation and routing, Forms cookbook; pub.dev documentation for provider, flutter_riverpod, flutter_bloc and go_router
@story
The Kasi Market app now has a product list, a cart and a checkout. Sipho added the cart count to three screens and they keep showing different numbers. "State is everywhere and nowhere," he groans. This chapter is about putting data in ONE place, moving between screens properly, and never letting a customer submit an order with an empty phone number.
@lab dev:flutter-first

=== lesson d04-1 | App State: setState, Lifting State Up and Provider/Riverpod/BLoC | 30
@analogy Ephemeral state is a sticky note on your own desk - only you need it. App state is the whiteboard in the office: everyone reads it, and when it changes, everyone who is looking at it should notice. State management is simply the rules for who may write on the whiteboard and how others get notified.
@objectives
- Distinguish ephemeral (local) state from app state
- Lift state up and pass callbacks down
- Compare Provider, Riverpod and BLoC at a high level
@body
**Ephemeral state** - belongs to one widget (is this tab selected? is the password visible?). [[setState]] is perfect.

**App state** - shared across screens (logged-in user, cart, product list). If each screen keeps its own copy they drift apart (Sipho's bug). Two steps fix it:
1. **Lift state up** to the nearest common ancestor and pass data down + callbacks up ([[onAdd: () => ...]]).
2. When that gets clumsy, use a **state-management** package that holds the state outside the widget tree and **notifies** listeners.

~~~
// A tiny cart model with provider (ChangeNotifier)
class CartModel extends ChangeNotifier {
  final List<Product> _items = [];
  List<Product> get items => List.unmodifiable(_items);
  int get totalCents => _items.fold(0, (sum, p) => sum + p.priceCents);

  void add(Product p) {
    _items.add(p);
    notifyListeners();          // every widget watching the cart rebuilds
  }
}

// main.dart
runApp(ChangeNotifierProvider(create: (_) => CartModel(), child: const MyApp()));

// any widget, any screen
final count = context.watch<CartModel>().items.length;   // rebuilds on change
context.read<CartModel>().add(product);                   // call without listening
~~~

| Approach | In one line | Good for |
|---|---|---|
| **setState** | Local state inside one widget | Toggles, form fields, animations |
| **Provider** | InheritedWidget made easy; ChangeNotifier + watch/read | Small to medium apps, learning |
| **Riverpod** | Provider's successor: compile-safe, testable, no BuildContext needed | Most new professional apps |
| **BLoC** | Events in -> states out via Streams; very explicit | Large teams, strict architecture, banking apps |

There is no single "right" answer - the Flutter docs list many options. What matters is: **one source of truth**, **UI = f(state)** (the screen is a pure function of the state), and business logic **outside** widgets so it can be unit tested.

**Architecture** most teams use: *UI (widgets)* -> *state/view-model (Riverpod notifier, Bloc, ChangeNotifier)* -> *repository* (fetches and caches data) -> *data source* (HTTP API, local database). Each layer only talks to the one below it.
@terms
- Ephemeral state :: State only one widget cares about (setState is fine)
- App state :: Data shared across many widgets and screens (cart, user, settings)
- Lifting state up :: Moving state to a common ancestor and passing data/callbacks down
- ChangeNotifier :: A class that calls notifyListeners() so watching widgets rebuild
- Provider :: Package that makes objects available down the widget tree and rebuilds watchers
- Riverpod :: Compile-safe, testable successor to Provider
- BLoC :: Business Logic Component - events in, states out, using streams
- Single source of truth :: Each piece of data lives in exactly one place
- Repository pattern :: A class that hides where data comes from (API, cache, database)
@pro
- "UI is a function of state: I keep one source of truth and let widgets react to it."
- "Business logic lives in notifiers or blocs, not in widgets, so it's unit-testable."
@interview Three screens show different cart counts. How do you fix the design? :: Each screen holds its own copy of the cart, so they drift. I'd move the cart into a single source of truth - for example a Riverpod notifier or a ChangeNotifier provided above MaterialApp - expose methods like add and remove, and have every screen watch that one object. Then a change notifies all listeners and every screen rebuilds with the same value, and the cart logic can be unit-tested without any UI.
@quiz
? Which state is best handled with plain setState?
+ Whether a password field shows its text
- The logged-in user used by every screen
- The shopping cart
- The product catalogue
> Local, ephemeral UI state.
? In provider, what does notifyListeners() do?
- Saves to disk
+ Tells watching widgets the data changed so they rebuild
- Sends a push notification
- Navigates to a new screen
> It's the "the whiteboard changed!" shout.
? context.watch<CartModel>() vs context.read<CartModel>() - which rebuilds the widget when the cart changes?
+ watch
- read
- both
- neither
> watch subscribes; read just grabs the object (use it in callbacks).
? In a layered app, which layer should call the HTTP API?
- The widgets
+ A repository / data source layer
- main()
- The theme
> Widgets ask the state layer, which asks the repository.

=== lesson d04-2 | Navigation and Routing with Navigator and go_router | 25
@analogy Navigation is a stack of plates. Opening a product detail screen puts a new plate on top (push); the back button takes the top plate off (pop). go_router adds street addresses to each plate, so a link like kasimarket.co.za/product/42 can open the exact right plate - even from outside the app.
@objectives
- Push and pop screens with Navigator
- Pass data to and return results from a screen
- Use go_router for named, URL-based and deep-link routing
@body
**Imperative navigation (Navigator 1.0)** - fine for simple apps:
~~~
// open the detail screen, passing the product
Navigator.of(context).push(
  MaterialPageRoute(builder: (_) => ProductPage(product: p)),
);
// on the detail screen: go back, optionally returning a value
Navigator.of(context).pop(true);
~~~
To get a result back: [[final added = await Navigator.of(context).push(...)]] - push returns a Future that completes when the screen pops.

**Declarative routing with go_router** (maintained by the Flutter team) - the URL describes the screen, which you need for **web**, **deep links** (a WhatsApp link opening the app on a product) and **notifications**:
~~~
final router = GoRouter(
  routes: [
    GoRoute(path: '/', builder: (_, __) => const HomePage()),
    GoRoute(
      path: '/product/:id',
      builder: (_, state) => ProductPage(id: state.pathParameters['id']!),
    ),
    GoRoute(path: '/cart', builder: (_, __) => const CartPage()),
  ],
  redirect: (context, state) {
    final loggedIn = authState.isLoggedIn;
    return (!loggedIn && state.matchedLocation == '/cart') ? '/login' : null;
  },
);

MaterialApp.router(routerConfig: router);
context.go('/product/42');     // replace the stack with this location
context.push('/cart');         // push on top (back button returns)
~~~
- **Path parameters** ([[:id]]) and **query parameters** ([[?q=bread]]) carry data in the URL.
- **redirect** is a route guard: unauthenticated users are sent to /login.
- **ShellRoute / StatefulShellRoute** keep a bottom navigation bar while inner pages change.

**Deep links** need platform setup: Android **App Links** (assetlinks.json on your domain) and iOS **Universal Links** (apple-app-site-association). Then https://kasimarket.co.za/product/42 opens the app straight to that product.
@terms
- Navigator :: Flutter's stack of routes (screens) with push and pop
- push / pop :: Add a screen on top / remove the top screen
- Route :: A screen (page) in the navigation stack
- go_router :: Declarative, URL-based routing package from the Flutter team
- Path parameter :: Variable part of a route path such as :id
- Deep link :: A URL that opens the app directly on a specific screen
- Route guard (redirect) :: Logic that sends users elsewhere, e.g. to login
- ShellRoute :: go_router feature keeping shared UI (bottom nav) around child routes
@pro
- "We use go_router so every screen has a URL - that gives us web support and deep links for free."
- "Auth is enforced with a redirect guard, not by hiding buttons."
@interview How would you make a WhatsApp link open the app on a specific product? :: Use URL-based routing such as go_router with a route like /product/:id, then configure deep linking: Android App Links with an assetlinks.json file on the domain and iOS Universal Links with an apple-app-site-association file. The link https://kasimarket.co.za/product/42 then launches the app and go_router builds the product page for id 42; if the app isn't installed, the same URL can fall back to the website.
@quiz
? What does Navigator.pop(context) do?
+ Removes the top screen and returns to the previous one
- Closes the app
- Pushes a new screen
- Clears all screens
> pop = take the top plate off the stack.
? Why prefer go_router for an app that also runs on the web?
- It is the only router that compiles
+ Each screen has a URL, enabling browser navigation and deep links
- It removes the need for widgets
- It makes the app faster to download
> URL-based routing = web + deep links.
? In go_router, how do you read id from the path /product/:id?
+ state.pathParameters['id']
- state.query
- Navigator.id
- context.id
> Path parameters are in state.pathParameters.
? Which go_router feature sends a logged-out user to /login?
- ShellRoute
+ redirect
- builder
- push
> redirect acts as a route guard.

=== lesson d04-3 | Forms, Validation and User Input | 25
@analogy A form is a bank teller checking your deposit slip before accepting it: every box must be filled in, the account number must have the right number of digits, and only then is it processed. Validating on the phone is the polite teller; validating again on the server is the vault door that never trusts anyone.
@objectives
- Build a Form with TextFormFields, validators and a GlobalKey
- Use controllers, keyboards and input formatters
- Explain why validation must ALSO happen on the server
@body
~~~
final _formKey = GlobalKey<FormState>();
final _phone = TextEditingController();

Form(
  key: _formKey,
  child: Column(children: [
    TextFormField(
      controller: _phone,
      keyboardType: TextInputType.phone,
      decoration: const InputDecoration(labelText: 'Cellphone', hintText: '072 123 4567'),
      validator: (v) {
        final digits = (v ?? '').replaceAll(RegExp(r'\D'), '');
        if (digits.isEmpty) return 'Please enter your number';
        if (digits.length != 10 || !digits.startsWith('0')) return 'Use a 10-digit SA number, e.g. 0721234567';
        return null;                 // null = valid
      },
    ),
    FilledButton(
      onPressed: () {
        if (_formKey.currentState!.validate()) {
          // all fields valid: submit the order
        }
      },
      child: const Text('Place order'),
    ),
  ]),
)
~~~
- A **validator** returns an error message string, or **null** when valid.
- [[_formKey.currentState!.validate()]] runs every validator and shows the messages.
- **TextEditingController** reads/sets the text - remember to dispose() it.
- Use the right **keyboardType** (phone, number, email) and **inputFormatters** ([[FilteringTextInputFormatter.digitsOnly]]) to prevent bad input in the first place.
- **autovalidateMode: AutovalidateMode.onUserInteraction** shows errors as the user types after their first edit - friendlier than shouting on submit.
- Disable the submit button while a request is in flight (avoid double orders) and show a progress indicator.

**Client validation is for user experience, server validation is for security.** Anyone can bypass your app and call the API directly with curl. ASP.NET Core must validate again (data annotations such as Required and StringLength, or FluentValidation) and return **400 Bad Request** with field errors - which the app then shows next to the fields.

**POPIA** (South Africa's Protection of Personal Information Act): only collect personal data you need (do you really need an ID number to sell bread?), say why you collect it, store it securely, and let users ask for it to be deleted.
@terms
- Form :: Widget grouping fields so they can be validated and saved together
- TextFormField :: Text input with built-in validator support
- Validator :: Function returning an error message, or null when the input is valid
- GlobalKey<FormState> :: Handle used to call validate() and save() on a Form
- TextEditingController :: Reads and controls a text field's value
- Input formatter :: Filters keystrokes (e.g. digits only) before they reach the field
- Server-side validation :: Re-checking input on the API because clients can't be trusted
- POPIA :: South Africa's Protection of Personal Information Act - collect minimal data, protect it
@pro
- "Client-side validation is UX; server-side validation is security - we always do both."
- "Under POPIA we collect only what we need and explain why."
@interview Why validate on the server if the Flutter app already validates input? :: Because the client is outside our control - anyone can call the API with curl or a modified app and skip our checks. Client validation gives quick friendly feedback; server validation protects data integrity and security, rejecting bad input with a 400 and field-level errors. Validation rules can also live in a shared contract so both sides agree.
@quiz
? A TextFormField validator returns null. What does that mean?
+ The value is valid
- The value is empty
- Validation crashed
- The field is disabled
> null = no error message = valid.
? Which keyboard should a cellphone-number field request?
- TextInputType.text
+ TextInputType.phone
- TextInputType.multiline
- TextInputType.url
> Shows the dial pad and reduces typing errors.
? Why must the ASP.NET API validate input again?
- Flutter validators don't work on Android
+ Clients can be bypassed - anyone can call the API directly
- It is required by Dart
- To make the app slower
> Never trust the client.
?? Which practices make a checkout form robust? (choose all)
+ Disable the submit button while the request is running
+ Use input formatters for digit-only fields
+ Dispose TextEditingControllers
- Validate only on the server and show no messages in the app
> Good UX plus correctness.

=== boss
? Which state-management approach uses events in and states out via streams?
- setState
- Provider
+ BLoC
- go_router
> BLoC = Business Logic Component.
? A product detail page must open from https://kasimarket.co.za/product/42. What do you need?
+ URL-based routes (e.g. go_router /product/:id) plus App Links / Universal Links setup
- Navigator.pop only
- A bigger APK
- A StatefulWidget for every product
> Deep linking needs both routing and platform config.
? The cart is shown on 3 screens with different numbers. Root cause?
- Hot reload
+ No single source of truth - each screen keeps its own copy
- Too many const widgets
- Missing SafeArea
> Lift it up or move it to a provider/notifier.
? What does _formKey.currentState!.validate() return when one field is invalid?
- null
+ false (and the error message is shown under the field)
- true
- It throws an exception
> validate() returns true only if every validator returned null.
? Under POPIA, an app selling bread asks for customers' ID numbers "just in case". The issue?
+ It collects personal information it doesn't need (minimality)
- IDs are too long for a TextFormField
- It's fine as long as the app is in Flutter
- It breaks go_router
> Collect only what is necessary for the purpose.
`;
