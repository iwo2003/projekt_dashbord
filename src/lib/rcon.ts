import net from "net";

function packet(id: number, type: number, body: string) {
  const payload = Buffer.from(`${body}\0\0`, "utf8");
  const size = 8 + payload.length;
  const buffer = Buffer.alloc(4 + size);
  buffer.writeInt32LE(size, 0);
  buffer.writeInt32LE(id, 4);
  buffer.writeInt32LE(type, 8);
  payload.copy(buffer, 12);
  return buffer;
}

export function sourceRcon(port: number, password: string, command: string) {
  return new Promise<string>((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    let authed = false;
    let settled = false;
    let buffer = Buffer.alloc(0);
    let response = "";
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error(authed ? "rcon_timeout" : "server_offline"));
    }, 8000);

    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.end();
      resolve(value.trim());
    };

    socket.on("connect", () => {
      socket.write(packet(1, 3, password));
    });

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const size = buffer.readInt32LE(0);
        if (buffer.length < size + 4) return;
        const id = buffer.readInt32LE(4);
        const body = buffer.subarray(12, size + 4 - 2).toString("utf8");
        buffer = buffer.subarray(size + 4);
        if (!authed) {
          if (id === -1) {
            clearTimeout(timer);
            socket.destroy();
            reject(new Error("rcon_auth"));
            return;
          }
          authed = true;
          socket.write(packet(2, 2, command));
          continue;
        }
        response += body;
        setTimeout(() => finish(response), 250);
      }
    });

    socket.on("error", () => {
      clearTimeout(timer);
      reject(new Error("server_offline"));
    });
    socket.on("end", () => {
      if (authed) finish(response);
    });
  });
}
