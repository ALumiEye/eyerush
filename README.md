# EyeRush

**Phố Đua · by ALumiEye**

Motorbike racing through rush-hour streets, in the browser. Weave through hundreds of bikes, cars,
buses and delivery carts, honk your way through, cut down alleys and across the market, and beat
the other riders home.

Đua xe máy xuyên phố giờ cao điểm, chơi ngay trên trình duyệt. Lách qua hàng trăm xe máy, ô tô, xe
buýt, xe ba gác; bấm còi dẹp đường, cắt qua ngõ nhỏ, xuyên chợ và về đích trước các tay lái khác.

## Play / Chơi ngay

**In the browser / Trên trình duyệt:** https://alumieye.github.io/eyerush/

**Offline, no install:** download `eyerush.html` from the
[latest release](https://github.com/ALumiEye/eyerush/releases/latest) and double-click it. The whole
game is in that one file.

**Không cần mạng, không cần cài:** tải `eyerush.html` ở
[bản phát hành mới nhất](https://github.com/ALumiEye/eyerush/releases/latest) rồi bấm đúp để mở.

Releases: push a tag such as `v0.2.0` and the Release workflow builds the game and publishes it,
using `docs/releases/<tag>.md` as the notes when that file exists.

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

- **Gates:** pass the gates in order; three laps wins. Any route is allowed: alleys, sidewalks, the
  covered market, the lake park. The arrow at the screen edge points to the next gate.
  / Đi qua các cổng theo thứ tự, đủ 3 vòng là về đích. Đường nào cũng được.
- **Rush-hour traffic:** every vehicle drives its own lane, stops at red lights and brakes for what
  is ahead. Bikes squeeze into gaps; after a long wait, everyone noses through the junction.
  / Xe trong phố tự chạy theo làn, dừng đèn đỏ, xe máy lách khe.
- **Near misses and slipstream** charge the boost. / **Lách sát nút** và **bám đuôi** ô tô, xe buýt
  để nạp thanh tăng tốc.
- **Horn:** bikes ahead swerve aside, cars edge over. / **Còi:** xe máy phía trước dạt ra.
- **Crashes:** hit a wall or a vehicle hard and the rider falls for over a second; ride into the lake
  and you are put back on the road. / Đâm mạnh là té xe; lao xuống hồ thì được đưa lại lên đường.

Settings: difficulty, traffic density (light, rush hour, gridlock) and 3 or 5 rivals.

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
