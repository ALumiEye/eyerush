# EyeRush

**Đi làm giờ cao điểm · by ALumiEye**

07:57. You overslept, and work starts at 08:00. Ride your motorbike from home to the office through
rush-hour traffic, stop at red lights, mind traffic police, and dodge potholes and road craters.
No racing opponents or laps: the clock is your rival.

07:57. Bạn vừa dậy muộn và 08:00 phải chấm công. Lái xe máy từ nhà đến cơ quan, vượt qua tắc đường,
đèn xanh đèn đỏ, chốt CSGT, ổ gà và ổ voi. Không đua vòng, không đối thủ — chỉ có bạn và giờ đi làm.

## Play / Chơi ngay

**In the browser / Trên trình duyệt:** https://alumieye.github.io/eyerush/

**Offline, no install:** download `eyerush.html` from the
[latest release](https://github.com/ALumiEye/eyerush/releases/latest) and double-click it. The whole
game is in that one file.

**Không cần mạng, không cần cài:** tải `eyerush.html` ở
[bản phát hành mới nhất](https://github.com/ALumiEye/eyerush/releases/latest) rồi bấm đúp để mở.

The menu footer shows the running version: the release tag, or `main · <commit>` on the web.
/ Cuối menu hiện phiên bản đang chạy.

Releases: bump `version` in `package.json`, write `docs/releases/<tag>.md`, commit, then push a tag such
as `v0.3.0`. The Release workflow tests, builds and publishes `eyerush.html` with `SHA256SUMS.txt`;
the release appears only after everything passes. The web version deploys from `main` on every push.

**From source / Từ mã nguồn** (Node.js 22+ and pnpm):

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

## Controls / Điều khiển

| Key / Phím | Action | Hành động |
|---|---|---|
| `W` `↑` | Throttle | Ga |
| `S` `↓` | Brake, then reverse | Phanh, rồi lùi |
| `A` `D` `←` `→` | Steer | Lái |
| `Space` | Boost | Tăng tốc |
| `H` `Shift` | Horn | Bấm còi |
| `R` | Back on the road | Dựng xe lại |
| `Esc` `P` | Pause | Tạm dừng |

Gamepads work too (stick or d-pad, RT/LT, A boost, B/X horn). On a phone the bike rides by itself:
steer with the buttons on the left, brake, honk and boost on the right.

Có hỗ trợ tay cầm. Trên điện thoại xe tự chạy: lái bằng nút bên trái, phanh, còi và tăng tốc bên phải.

## How it plays / Lối chơi

- **Morning route:** follow five ordered navigation markers from home to the office. The minimap
  shows the route; the screen-edge arrow points to the next stop. Arrive before the deadline to win.
  / Theo năm điểm dẫn đường từ nhà đến cơ quan, tới trước giờ chấm công để thắng.
- **Deadline:** easy/normal/hard allow 180/150/120 real seconds, representing 07:57–08:00 on the
  morning clock. Police detention consumes actual game time; there is no additional clock jump.
  / Dễ/thường/khó có 180/150/120 giây chơi, tương ứng 07:57–08:00 trong game.
- **Red lights and police:** crossing any red stop line triggers a 5-second police detention, with
  an on-screen countdown and an officer beside the bike. Throttle, boost and reset are locked;
  traffic cannot shove the rider away. The clock keeps running and can expire during detention.
  / Vượt đèn đỏ ở mọi giao lộ sẽ bị CSGT giữ xe 5 giây, có đếm ngược; không thể chạy hay reset
  để thoát. Đồng hồ vẫn trôi. Đây là luật arcade, không phải mức phạt giao thông thực tế.
- **Navigation and rider:** larger high-contrast minimap, amber current leg, blue upcoming route,
  white heading arrow and labeled office. Bikes show a rider, forward visor, handlebars/headlight
  and red tail lamp; the worker carries a work bag.
- **Flower medians:** raised flower beds replace yellow avenue centre lines and physically block
  crossing, with openings at roads and alleys. Hard impacts can cause a crash.
  / Dải phân cách trồng hoa có va chạm, chừa lối tại giao lộ và ngõ.
- **Wrong-way riding:** travelling against your lane triggers a 5-second police detention, then
  relocates you to the right-hand lane facing your intended direction. Junction turns and slow
  reverse manoeuvres are excluded. / Ngược chiều bị giữ 5 giây rồi đưa về đúng làn, đúng hướng.
- **Quick controls:** the in-game guide stays visible. Use four arrows or WASD; Down/S brakes then
  reverses, Space boosts. No separate desktop brake button.
- **Potholes and craters:** potholes kill momentum; hitting a crater above 32 km/h throws you off.
  Dodge them, or crawl below 11 km/h to cross without damage. / Né ổ gà, ổ voi hoặc giảm tốc để qua.
- **Rush-hour traffic:** every vehicle drives its own lane, stops at red lights and brakes for what
  is ahead. Bikes squeeze into gaps; after a long wait, everyone noses through the junction.
  / Xe trong phố tự chạy theo làn, dừng đèn đỏ, xe máy lách khe.
- **Near misses and slipstream** charge the boost. / **Lách sát nút** và **bám đuôi** ô tô, xe buýt
  để nạp thanh tăng tốc.
- **Horn:** bikes ahead swerve aside, cars edge over. / **Còi:** xe máy phía trước dạt ra.
- **Crashes:** hit a wall or a vehicle hard and the rider falls for over a second; ride into the lake
  and you are put back on the road. / Đâm mạnh là té xe; lao xuống hồ thì được đưa lại lên đường.

Settings: difficulty and traffic density (light, rush hour, gridlock). Results report arrival status,
violations, actual time detained, pothole hits and crashes. The original race simulation remains for
menu attract mode and headless bot regression checks.

## Code

```
src/core     the race rules: city, traffic, bikes, bots — plain TypeScript, deterministic
src/client   PixiJS drawing, Web Audio sound, input, menus
test         rule tests (vitest)
scripts      race.ts: bots race headless and report; shot.ts: screenshots in headless Chrome
```

All art is drawn by code and all sound is synthesised live, so the game ships no media files.
Every street name and rider name is invented.

```bash
pnpm test        # rule tests
pnpm race 7 2    # bots race seed 7 on hard, prints times and tick cost
pnpm build && pnpm shot   # screenshots into shots/
```

## License

Apache-2.0 © ALumiEye
