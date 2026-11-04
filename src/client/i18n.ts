/** Vietnamese and English text for everything on screen. */

const VI = {
  subtitle: "Phố Đua · đua xe máy giờ cao điểm",
  race: "Đua ngay",
  difficulty: "Độ khó",
  difficulties: ["Dễ", "Thường", "Khó"],
  traffic: "Mật độ xe",
  traffics: ["Thưa", "Giờ cao điểm", "Kẹt cứng"],
  rivals: "Số đối thủ",
  howTo: "Cách chơi",
  sound: "Âm thanh",
  on: "Bật",
  off: "Tắt",
  language: "English",
  back: "Quay lại",
  resume: "Tiếp tục",
  restart: "Đua lại",
  menu: "Về menu",
  paused: "Tạm dừng",
  go: "ĐI!",
  place: "Hạng",
  lap: "Vòng",
  time: "Thời gian",
  best: "Kỷ lục",
  bestLap: "Vòng nhanh nhất",
  nearMisses: "Lách sát nút",
  crashes: "Té xe",
  boost: "TĂNG TỐC",
  ready: "sẵn sàng",
  finished: "Về đích",
  dnf: "Chưa về",
  results: "Kết quả",
  newRecord: "Kỷ lục mới!",
  you: "Bạn",
  nearMiss: "SÁT NÚT!",
  crash: "RẦM!",
  splash: "Ùm!",
  honk: "BÍP!",
  wrongWay: "Đi theo mũi tên tới cổng tiếp theo",
  lastLap: "Vòng cuối!",
  lapDone: "Hết vòng",
  slipstream: "Bám đuôi",
  howToText: [
    "<b>W / ↑</b> ga · <b>S / ↓</b> phanh, lùi · <b>A D / ← →</b> lái",
    "<b>Space</b> tăng tốc · <b>H</b> hoặc <b>Shift</b> bấm còi · <b>R</b> dựng xe lại · <b>Esc</b> tạm dừng",
    "Chạy qua các cổng theo thứ tự, đủ 3 vòng là về đích. Đi đường nào cũng được: ngõ nhỏ, vỉa hè, chợ, công viên…",
    "<b>Lách sát nút</b> qua xe khác khi đang nhanh và <b>bám đuôi</b> ô tô, xe buýt để nạp thanh tăng tốc.",
    "<b>Bấm còi</b> để xe máy phía trước dạt ra. Đâm mạnh vào tường hay xe khác là té xe, mất vài giây.",
    "Xe trong thành phố dừng đèn đỏ. Bạn thì… tuỳ bạn.",
  ],
  touchHint: "Trên điện thoại: xe tự chạy, giữ PHANH để chậm lại.",
};

type Strings = typeof VI;

const EN: Strings = {
  subtitle: "Rush-hour motorbike racing",
  race: "Race now",
  difficulty: "Difficulty",
  difficulties: ["Easy", "Normal", "Hard"],
  traffic: "Traffic",
  traffics: ["Light", "Rush hour", "Gridlock"],
  rivals: "Rivals",
  howTo: "How to play",
  sound: "Sound",
  on: "On",
  off: "Off",
  language: "Tiếng Việt",
  back: "Back",
  resume: "Resume",
  restart: "Restart",
  menu: "Menu",
  paused: "Paused",
  go: "GO!",
  place: "Place",
  lap: "Lap",
  time: "Time",
  best: "Record",
  bestLap: "Best lap",
  nearMisses: "Near misses",
  crashes: "Crashes",
  boost: "BOOST",
  ready: "ready",
  finished: "Finished",
  dnf: "Still racing",
  results: "Results",
  newRecord: "New record!",
  you: "You",
  nearMiss: "CLOSE ONE!",
  crash: "CRASH!",
  splash: "Splash!",
  honk: "BEEP!",
  wrongWay: "Follow the arrow to the next gate",
  lastLap: "Final lap!",
  lapDone: "Lap",
  slipstream: "Slipstream",
  howToText: [
    "<b>W / ↑</b> throttle · <b>S / ↓</b> brake, reverse · <b>A D / ← →</b> steer",
    "<b>Space</b> boost · <b>H</b> or <b>Shift</b> horn · <b>R</b> back on the road · <b>Esc</b> pause",
    "Pass the gates in order; three laps and you are home. Any route goes: alleys, sidewalks, the market, the park…",
    "<b>Near misses</b> at speed and <b>slipstreaming</b> cars and buses charge your boost.",
    "<b>Honk</b> and bikes ahead move aside. Hit a wall or a vehicle hard and you fall off for a few seconds.",
    "City traffic stops at red lights. You… that is up to you.",
  ],
  touchHint: "On a phone the bike rides by itself; hold BRAKE to slow down.",
};

export const recall = (key: string): string | null => {
  try {
    return localStorage.getItem(`eyerush.${key}`);
  } catch {
    return null;
  }
};

export const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(`eyerush.${key}`, value);
  } catch {
    // Storage can be blocked; the game works without it.
  }
};

let language: "vi" | "en" = recall("language") === "en" ? "en" : "vi";

export const currentLanguage = () => language;
export function setLanguage(next: "vi" | "en") {
  language = next;
  remember("language", next);
  document.documentElement.lang = next;
}

export const t = (): Strings => (language === "en" ? EN : VI);
