import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

export default function App() {
  const socket = useMemo(() => io(SERVER_URL, { autoConnect: true }), []);
  const [screen, setScreen] = useState("home");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [room, setRoom] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    socket.on("room:update", updated => {
      setRoom(updated);
      const me = updated.players.find(p => p.id === socket.id);
      setReady(Boolean(me?.ready));
    });
    socket.on("game:starting", data => setNotice(data.message));
    socket.on("connect_error", () => setError("서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해 주세요."));
    return () => {
      socket.off("room:update");
      socket.off("game:starting");
      socket.off("connect_error");
      socket.disconnect();
    };
  }, [socket]);

  function validName() {
    if (!name.trim()) { setError("닉네임을 입력해 주세요."); return false; }
    return true;
  }
  function createRoom() {
    setError(""); setNotice("");
    if (!validName()) return;
    socket.emit("room:create", { name }, result => {
      if (!result.ok) return setError(result.error);
      setRoom(result.room); setScreen("lobby"); setReady(true);
    });
  }
  function joinRoom() {
    setError(""); setNotice("");
    if (!validName()) return;
    socket.emit("room:join", { name, code }, result => {
      if (!result.ok) return setError(result.error);
      setRoom(result.room); setScreen("lobby"); setReady(false);
    });
  }
  function toggleReady() {
    const next = !ready;
    socket.emit("player:ready", { ready: next }, result => {
      if (!result.ok) setError(result.error);
      else setReady(next);
    });
  }
  function startGame() {
    setError(""); setNotice("");
    socket.emit("game:start", {}, result => {
      if (!result.ok) setError(result.error);
    });
  }
  function leaveRoom() {
    socket.emit("room:leave");
    setRoom(null); setScreen("home"); setError(""); setNotice(""); setReady(false);
  }

  const isHost = room?.hostId === socket.id;
  const allReady = room?.players?.length >= 3 && room.players.every(p => p.ready);
  const canStart = isHost && allReady && room?.status === "lobby";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">♠</span> COUP<span className="brand-light">ONLINE</span></div>
        <div className="online-pill"><i /> FRIENDS ROOM</div>
      </header>

      {screen === "home" ? (
        <section className="home-layout">
          <div className="hero">
            <div className="eyebrow">THE GAME OF BLUFF & INFLUENCE</div>
            <h1>TRUST<br/><em>NO ONE.</em></h1>
            <p className="hero-copy">거짓말은 전략이고, 의심은 무기다.<br/>친구들과 마지막 영향력 카드가 남을 때까지 살아남으세요.</p>
            <div className="hero-rule"><span>03—06 PLAYERS</span><b /> <span>CLASSIC COUP</span><b /> <span>PRIVATE ROOM</span></div>
          </div>

          <div className="panel entry-panel">
            <div className="panel-kicker">WELCOME, PLAYER</div>
            <h2>게임에 참여하기</h2>
            <label htmlFor="nickname">닉네임</label>
            <input id="nickname" value={name} maxLength={14} onChange={e => setName(e.target.value)} placeholder="게임에서 사용할 이름" />
            <button className="primary-btn" onClick={createRoom}>새로운 방 만들기 <span>↗</span></button>
            <div className="or-line"><span>OR JOIN EXISTING ROOM</span></div>
            <label htmlFor="roomcode">초대 코드</label>
            <input id="roomcode" className="code-input" value={code} maxLength={5} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="ABCDE" />
            <button className="secondary-btn" onClick={joinRoom}>초대 코드로 입장</button>
            {error && <p className="error-msg">{error}</p>}
            <p className="fine-print">계정 없이 닉네임만으로 참여할 수 있습니다.</p>
          </div>
        </section>
      ) : (
        <section className="lobby-wrap">
          <div className="lobby-heading">
            <div><div className="eyebrow">PRIVATE GAME ROOM</div><h1>대기실<span>.</span></h1></div>
            <button className="text-btn" onClick={leaveRoom}>← 나가기</button>
          </div>
          <div className="panel room-panel">
            <div className="room-code-block">
              <div><div className="panel-kicker">INVITATION CODE</div><div className="room-code">{room?.code}</div></div>
              <button className="copy-btn" onClick={() => navigator.clipboard?.writeText(room?.code || "")}>코드 복사</button>
            </div>
            <div className="player-heading"><h2>플레이어</h2><span>{room?.players?.length || 0} / 6</span></div>
            <div className="player-list">
              {room?.players?.map((player, index) => (
                <div className="player-row" key={player.id}>
                  <div className="player-avatar">{player.name.slice(0,1).toUpperCase()}</div>
                  <div className="player-info"><strong>{player.name} {player.id === socket.id && <small>(나)</small>}</strong><span>{player.isHost ? "방장" : "플레이어"} · 플레이어 {index + 1}</span></div>
                  <div className={`status ${player.ready ? "is-ready" : ""}`}>{player.ready ? "준비 완료" : "대기 중"}</div>
                </div>
              ))}
              {Array.from({ length: Math.max(0, 3 - (room?.players?.length || 0)) }).map((_, i) => (
                <div className="player-row empty-row" key={`empty-${i}`}><div className="player-avatar">＋</div><div className="player-info"><strong>플레이어 대기 중</strong><span>초대 코드를 공유하세요</span></div></div>
              ))}
            </div>
            <div className="lobby-actions">
              {!isHost && <button className={ready ? "secondary-btn" : "primary-btn"} onClick={toggleReady}>{ready ? "준비 취소" : "준비 완료"}</button>}
              {isHost && <button className="primary-btn" disabled={!canStart} onClick={startGame}>게임 시작 <span>↗</span></button>}
              <p>{room?.players?.length < 3 ? "최소 3명이 모여야 게임을 시작할 수 있습니다." : !allReady ? "모든 플레이어가 준비하면 시작할 수 있습니다." : isHost ? "모든 준비가 완료되었습니다." : "방장이 게임을 시작할 때까지 기다려 주세요."}</p>
            </div>
            {notice && <div className="notice">{notice}</div>}
            {error && <p className="error-msg">{error}</p>}
          </div>
        </section>
      )}
      <footer><span>COUP ONLINE</span><span>BLUFF. CHALLENGE. SURVIVE.</span><span>PROTOTYPE 01</span></footer>
    </main>
  );
}