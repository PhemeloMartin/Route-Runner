import { chapter } from '../dsl.js';

const $ = '$';

export default chapter`
@chapter dev.d05 | Flutter 3: APIs, Offline Data, Testing and Publishing | 5
@sources docs.flutter.dev - Fetch data from the internet, JSON serialization, Persist data (shared_preferences, SQLite), Testing (unit, widget, integration), Deployment (Android app bundle, signing); Android developer docs - network security configuration; Google Play Console help
@story
The Kasi Market app looks great but shows fake products. Time to connect it to the real ASP.NET Core API you'll build next, keep working when the network drops during load-shedding, prove it works with automated tests, and publish it on the Play Store so Lindiwe's customers can install it.
@lab dev:flutter-first

=== lesson d05-1 | Calling a REST API: http, JSON Models and FutureBuilder | 30
@analogy The app is a customer phoning a restaurant (the API). It dials (HTTP request), waits politely without freezing (async), receives the menu read out in a standard format (JSON), and writes it neatly onto its own notepad as proper dishes (Dart model objects) before showing it to the user.
@objectives
- Fetch and post JSON with the http package
- Write fromJson/toJson model classes
- Show loading, data and error states (FutureBuilder or a state notifier)
- Reach a local API from an emulator (10.0.2.2) and understand cleartext rules
@body
~~~
// lib/models/todo.dart
class Todo {
  final int id;
  final String title;
  final bool isComplete;
  const Todo({required this.id, required this.title, required this.isComplete});

  factory Todo.fromJson(Map<String, dynamic> j) =>
      Todo(id: j['id'] as int, title: j['title'] as String, isComplete: j['isComplete'] as bool);

  Map<String, dynamic> toJson() => {'id': id, 'title': title, 'isComplete': isComplete};
}

// lib/data/todo_api.dart
class TodoApi {
  TodoApi(this.baseUrl);
  final String baseUrl;

  Future<List<Todo>> fetchAll() async {
    final res = await http.get(Uri.parse('$baseUrl/todos'))
        .timeout(const Duration(seconds: 10));
    if (res.statusCode != 200) throw Exception('Server said ${$}{res.statusCode}');
    final list = jsonDecode(res.body) as List<dynamic>;
    return list.map((e) => Todo.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Todo> create(String title) async {
    final res = await http.post(Uri.parse('$baseUrl/todos'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'title': title}));
    if (res.statusCode != 201) throw Exception('Create failed: ${$}{res.body}');
    return Todo.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }
}
~~~
Show the three states the user can see - **loading, data, error**:
~~~
FutureBuilder<List<Todo>>(
  future: _future,                              // created ONCE in initState, not in build!
  builder: (context, snap) {
    if (snap.connectionState != ConnectionState.done) return const CircularProgressIndicator();
    if (snap.hasError) return Text('Could not load: ${$}{snap.error}');
    final todos = snap.data!;
    return ListView.builder(itemCount: todos.length, itemBuilder: (_, i) => Text(todos[i].title));
  },
)
~~~
Bigger apps use **dio** (interceptors for auth tokens, retries) and **json_serializable/freezed** to generate fromJson/toJson instead of writing them by hand.

**Local development gotchas (they cost everyone an afternoon):**
- From the **Android emulator**, your PC's localhost is **10.0.2.2** (the emulator's own localhost is the emulator). iOS simulator can use localhost. A real phone needs your PC's LAN IP and the API listening on 0.0.0.0.
- **Android blocks plain http:// (cleartext)** by default since Android 9. Use https, or allow cleartext only for your dev host in a network security config - never in production.
- **Flutter web** is subject to **CORS** - the API must allow your web origin (you'll configure that in ASP.NET Core). Mobile apps are not affected by CORS.
@terms
- http package :: Dart package for making HTTP requests (get, post, put, delete)
- jsonDecode / jsonEncode :: dart:convert functions converting between JSON text and Dart maps/lists
- fromJson factory :: Constructor that builds a model object from a decoded JSON map
- FutureBuilder :: Widget that rebuilds when a Future completes (loading/data/error)
- Timeout :: A limit after which a request is abandoned - always set one on mobile
- 10.0.2.2 :: The Android emulator's address for the host PC's localhost
- Cleartext traffic :: Unencrypted http://, blocked by default on modern Android
- dio :: Popular HTTP client with interceptors, retries and cancellation
@pro
- "Every screen that loads data handles three states: loading, data and error."
- "From the Android emulator I call the host API on 10.0.2.2, not localhost."
@interview Your Flutter app works on the iOS simulator but the Android emulator can't reach the local API. Why? :: On the Android emulator, localhost means the emulator itself, so the app must call 10.0.2.2 to reach the host PC. Also Android blocks plain http by default, so for local development I either use https or allow cleartext for that dev host only via a network security config. I'd also check the API is listening on the right port and, for a real device, on 0.0.0.0 with the firewall open.
@quiz
? From the Android emulator, which address reaches the API running on your PC's localhost:5080?
- http://localhost:5080
+ http://10.0.2.2:5080
- http://127.0.0.1:5080
- http://192.168.0.1:5080
> 10.0.2.2 is the emulator's alias for the host loopback.
? Where should the Future for a FutureBuilder be created?
- Inside build(), every time
+ Once, e.g. in initState or a state notifier
- In main() only
- In the widget's constructor of every child
> Creating it in build() refires the request on every rebuild.
? Which function turns a JSON string into Dart maps and lists?
+ jsonDecode
- jsonEncode
- toString
- Uri.parse
> dart:convert jsonDecode.
? Why does a Flutter WEB app need CORS settings on the API while the Android app doesn't?
- Android doesn't use HTTP
+ Browsers enforce the same-origin policy; native apps don't
- CORS only applies to Dart
- Web apps can't send JSON
> CORS is a browser security feature.

=== lesson d05-2 | Offline-First: Local Storage, Caching and Load-Shedding | 25
@analogy Offline-first is like keeping a stock book in the spaza shop even though the supplier has an online portal. When the network is down (load-shedding took the tower out), you keep selling from your own book, and when the signal returns you sync the book with the supplier.
@objectives
- Choose between shared_preferences, SQLite (sqflite/drift) and secure storage
- Cache API data and sync when back online
- Design for slow, expensive and intermittent networks
@body
| Need | Package | Notes |
|---|---|---|
| Small settings (theme, last tab) | **shared_preferences** | Key-value, simple types only |
| Structured data, queries | **sqflite** or **drift** (SQLite) | Real tables, indexes, transactions |
| Tokens and secrets | **flutter_secure_storage** | Uses Android Keystore / iOS Keychain |
| Files, images | **path_provider** + dart:io | App documents directory |

**Offline-first pattern** (the repository decides):
1. Show cached data from SQLite immediately (fast, works offline).
2. In the background, fetch from the API; on success update the cache and the UI.
3. When the user creates an order offline, save it locally with status **pending** and an **outbox** entry.
4. When connectivity returns, send pending items (with an **idempotency key** so a retry never creates a duplicate order), then mark them synced.

**Design for South African networks**: data is expensive and prepaid - send small JSON payloads, compress images, paginate lists ([[GET /products?page=2&pageSize=20]]), cache aggressively, and avoid auto-playing video. Many users are on 3G or patchy LTE during load-shedding when towers' batteries run low - always set timeouts and offer "retry".

**Never store secrets in shared_preferences** - it's a plain file on the device. JWT refresh tokens belong in secure storage. And remember POPIA: if the phone is lost, what personal data is sitting on it?
@terms
- shared_preferences :: Simple key-value storage for small settings
- sqflite / drift :: SQLite databases for structured local data in Flutter
- flutter_secure_storage :: Encrypted storage backed by Keystore/Keychain for tokens
- Offline-first :: Design where the app works from local data and syncs when online
- Cache :: Local copy of remote data for speed and offline use
- Outbox :: Queue of local changes waiting to be sent to the server
- Idempotency key :: Unique id sent with a request so retries don't create duplicates
- Pagination :: Fetching data in pages instead of all at once
@pro
- "The app is offline-first: it reads from SQLite instantly and syncs in the background."
- "Retries carry an idempotency key, so a flaky network can never create a double order."
@interview Customers complain the app shows a blank screen during load-shedding. How would you redesign it? :: Make it offline-first: the repository caches products and orders in SQLite, the UI shows cached data immediately, and a background refresh updates it when the network allows. New orders go into a local outbox marked pending and are synced with idempotency keys when connectivity returns, with clear UI showing "waiting to send". I'd add timeouts, retry buttons, pagination and smaller payloads because data is expensive.
@quiz
? Where should a JWT refresh token be stored on the phone?
- shared_preferences
+ flutter_secure_storage (Keystore/Keychain)
- A global variable
- In the app's README
> Secure storage encrypts it with platform keys.
? Why send an idempotency key with an order request?
+ So a retried request doesn't create a duplicate order
- To make the request faster
- It is required by JSON
- To bypass authentication
> The server recognises the repeat and returns the original result.
? Which storage fits 2 000 products you need to search and filter offline?
- shared_preferences
+ SQLite (sqflite/drift)
- A TextEditingController
- The widget tree
> Structured, queryable data = SQLite.
? Which choices respect expensive mobile data? (choose the best)
+ Paginate lists and compress images
- Download the full catalogue on every screen
- Auto-play product videos
- Disable caching
> Small, cached, paged.

=== lesson d05-3 | Testing and Publishing to the Play Store | 30
@analogy Tests are the quality checks on a bakery line: weigh one loaf (unit test), check a whole tray looks right (widget test), and taste a full order delivered to a customer's door (integration test). Publishing is getting a health certificate and a spot on the supermarket shelf - with your seal (signing key) on every loaf.
@objectives
- Write unit, widget and integration tests
- Build a signed release app bundle (.aab)
- Describe the Play Store release tracks and app versioning
@body
**The testing pyramid** - many fast unit tests, fewer widget tests, a handful of slow integration tests:
~~~
// test/cart_test.dart  - unit test (pure Dart, milliseconds)
test('total adds VAT-inclusive prices in cents', () {
  final cart = CartModel()..add(bread)..add(milk);
  expect(cart.totalCents, 1799 + 2499);
});

// test/widget_test.dart - widget test (builds UI in a fake environment)
testWidgets('tapping + adds an item', (tester) async {
  await tester.pumpWidget(const MyApp());
  expect(find.text('Cart (0)'), findsOneWidget);
  await tester.tap(find.byIcon(Icons.add_shopping_cart));
  await tester.pump();                  // rebuild after the tap
  expect(find.text('Cart (1)'), findsOneWidget);
});
~~~
- **Unit tests**: logic in models, notifiers, repositories. Use **mocktail** to fake the API.
- **Widget tests**: [[pumpWidget]], [[find]], [[tap]], [[pump]], [[expect]] - no device needed, run in CI.
- **Integration tests** (integration_test package): drive the real app on an emulator or device - slow, so keep them for critical journeys (login -> order -> pay).
- [[flutter test --coverage]] produces coverage; [[flutter analyze]] catches lint and type issues - both belong in CI.

**Releasing to Google Play:**
1. Set the version in pubspec.yaml: [[version: 1.2.0+12]] (1.2.0 shown to users, **+12 is the build number** that must increase on every upload).
2. Create an **upload keystore** (keytool) and reference it from android/key.properties - **never commit the keystore or passwords**. Google Play App Signing holds the final app signing key.
3. [[flutter build appbundle --release]] -> build/app/outputs/bundle/release/app-release.aab (Play requires .aab; it builds optimised APKs per device).
4. Upload in Play Console to **internal testing** -> closed testing -> open testing -> **production** with a staged rollout (e.g. 10%, then 50%, then 100%).
5. Complete the store listing, privacy policy (required!), data-safety form and content rating.

**iOS** needs a Mac with Xcode and an Apple Developer account (paid yearly) - teams often use a macOS CI runner or a service like Codemagic to build iOS without owning a Mac.
@terms
- Unit test :: Tests one function or class in isolation - fast
- Widget test :: Builds widgets in a test environment and interacts with them
- Integration test :: Runs the whole app on a device/emulator end to end
- Mock :: A fake dependency (e.g. API) that returns controlled answers in tests
- pump :: Asks the test environment to rebuild after an interaction
- App bundle (.aab) :: Publishing format required by Google Play
- Upload key / keystore :: Your private signing key proving updates come from you
- Build number :: The +N in version 1.2.0+N; must increase with every store upload
- Staged rollout :: Releasing to a percentage of users first to limit risk
@pro
- "Our CI runs flutter analyze and flutter test on every pull request."
- "We ship with staged rollouts so a bad release reaches 10% of users, not 100%."
@interview You uploaded version 1.3.0 to Play Console and it was rejected because the version code was already used. What happened? :: The build number after the plus sign in pubspec.yaml - the Android versionCode - must be strictly higher than every previous upload, and it wasn't bumped. I'd change version to 1.3.0+14 (or let CI set the build number from the pipeline run number), rebuild the app bundle and upload again.
@quiz
? In version: 2.1.0+37, what is 37?
- The minimum Android version
+ The build number (Android versionCode) that must increase every upload
- The number of tests
- The Dart version
> Versions shown to users: 2.1.0. Store build number: 37.
? Which test type needs no emulator and checks that tapping a button updates the UI?
- Integration test
+ Widget test
- Load test
- Manual test
> Widget tests run headless and fast.
? What does Google Play require you to upload for new apps?
- An .apk only
+ An Android App Bundle (.aab)
- The Dart source code
- An .ipa file
> .aab - Play generates device-specific APKs.
? Where should the upload keystore and its passwords be kept?
- Committed in the repo for convenience
+ Outside the repo, in a secure place / CI secrets
- In pubspec.yaml
- In the app's assets
> Losing or leaking the key is a serious security incident.

=== boss
? A FutureBuilder refetches data every time the user types in a search box. Why?
+ The Future is created inside build(), so every rebuild starts a new request
- FutureBuilder always polls
- The http package has no cache
- setState is broken
> Create the Future once (initState/notifier).
? The app must keep taking orders during a network outage. Which pattern?
- Show an error and quit
+ Offline-first with a local database and an outbox synced later
- Retry in an infinite tight loop
- Store orders in shared_preferences as plain text and forget them
> Offline-first with sync and idempotency.
?? Which belong in a Flutter CI job? (choose all)
+ flutter analyze
+ flutter test
+ flutter build appbundle (on main)
- Uploading the keystore to the public repo
> Lint, test, build - secrets come from CI secret storage.
? Android emulator code calls http://localhost:5080 and fails. Correct base URL for the host API?
- http://localhost:80
+ http://10.0.2.2:5080
- http://emulator:5080
- https://0.0.0.0:5080
> 10.0.2.2 = host machine.
? A staged rollout to 10% of users is mainly used to:
+ Limit the impact if the new version has a serious bug
- Save bandwidth for Google
- Test the store listing
- Avoid needing a build number
> Release safely, watch crash rates, then expand.
`;
