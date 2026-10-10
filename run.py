import os
import sys
import threading
import socket
import select

# Ensure backend directory is in python search path
base_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, base_dir)
backend_dir = os.path.join(base_dir, "backend")
if os.path.exists(backend_dir):
    sys.path.insert(0, backend_dir)

import uvicorn

def start_tcp_forwarder(source_port: int, target_port: int):
    """
    Transparent TCP socket forwarder.
    Forward connections from source_port to 127.0.0.1:target_port.
    Ensures Railway connects successfully regardless of whether it hits
    port 8080, 8000, or a custom target port.
    """
    def run_server():
        server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            server.bind(("0.0.0.0", source_port))
            server.listen(128)
            print(f"[PortForwarder] Forwarding 0.0.0.0:{source_port} -> 127.0.0.1:{target_port}", flush=True)
        except Exception:
            return

        while True:
            try:
                client_sock, _ = server.accept()
                def bridge(c_sock):
                    target_sock = None
                    try:
                        target_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                        target_sock.connect(("127.0.0.1", target_port))
                        while True:
                            r, _, _ = select.select([c_sock, target_sock], [], [], 30)
                            if not r:
                                break
                            if c_sock in r:
                                data = c_sock.recv(32768)
                                if not data:
                                    break
                                target_sock.sendall(data)
                            if target_sock in r:
                                data = target_sock.recv(32768)
                                if not data:
                                    break
                                c_sock.sendall(data)
                    except Exception:
                        pass
                    finally:
                        try:
                            c_sock.close()
                        except Exception:
                            pass
                        if target_sock:
                            try:
                                target_sock.close()
                            except Exception:
                                pass

                t = threading.Thread(target=bridge, args=(client_sock,), daemon=True)
                t.start()
            except Exception:
                break

    forwarder_thread = threading.Thread(target=run_server, daemon=True)
    forwarder_thread.start()

if __name__ == "__main__":
    raw_port = os.environ.get("PORT", "8080")
    try:
        primary_port = int(raw_port)
    except (ValueError, TypeError):
        primary_port = 8080

    # Ensure both standard Railway ports (8080 & 8000) are actively served
    aux_ports = [8000, 8080]
    for aux in aux_ports:
        if aux != primary_port:
            start_tcp_forwarder(aux, primary_port)

    print("==================================================")
    print(f"  PharmaShield API launching on 0.0.0.0:{primary_port}")
    print(f"  Multi-port resilience enabled for ports: {aux_ports}")
    print("==================================================", flush=True)

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=primary_port,
        workers=1,
        proxy_headers=True,
        forwarded_allow_ips="*",
        timeout_keep_alive=75,
        access_log=True,
    )
