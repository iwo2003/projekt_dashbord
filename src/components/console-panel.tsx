"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { ErrorNote } from "./ui";
import { useI18n } from "./i18n-provider";

export function ConsolePanel({ id, running }: { id: string; running: boolean }) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [command, setCommand] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stick, setStick] = useState(true);
  const box = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let source: EventSource | null = null;
    let stopped = false;
    let retry = 0;
    function connect() {
      source = new EventSource(`/api/servers/${id}/logs`);
      source.onmessage = (event) => {
        const payload = JSON.parse(event.data) as { line?: string };
        if (!payload.line) return;
        setText((current) => (current + payload.line).slice(-100000));
      };
      source.onerror = () => {
        source?.close();
        if (!stopped) retry = window.setTimeout(connect, 3000);
      };
    }
    connect();
    return () => {
      stopped = true;
      window.clearTimeout(retry);
      source?.close();
    };
  }, [id]);

  useEffect(() => {
    if (stick && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [text, stick]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const value = command.trim();
    if (!value) return;
    setCommand("");
    setText((current) => `${current}\n> ${value}\n`);
    try {
      const data = await api<{ output: string }>(`/api/servers/${id}/command`, {
        method: "POST",
        body: JSON.stringify({ command: value }),
      });
      if (data.output) setText((current) => `${current}${data.output}\n`);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-fog">
        <span>{t.detail.consoleHint}</span>
        <span>{stick ? t.detail.follow : t.detail.paused}</span>
      </div>
      <ErrorNote code={error} />
      <pre
        ref={box}
        className="console"
        onScroll={(event) => {
          const node = event.currentTarget;
          const near = node.scrollHeight - node.scrollTop - node.clientHeight < 40;
          setStick(near);
        }}
      >
        {text || (running ? t.loading : "—")}
      </pre>
      <form className="flex gap-2" onSubmit={send}>
        <input
          className="field font-mono"
          placeholder={t.detail.command}
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          disabled={!running}
        />
        <button className="btn btn-primary" type="submit" disabled={!running}>
          {t.detail.send}
        </button>
      </form>
    </div>
  );
}
