#!/bin/sh
set -eu
umask 077
if [ ! -x /usr/sbin/sshd ]; then
    printf '%s\n' 'Installing signed Alpine OpenSSH packages for this USB workspace...'
    apk add openssh || { echo 'Package download failed. Run workspace-pair again when online.'; exit 1; }
fi
hostkey=/etc/ssh/ssh_host_ed25519_key
if [ ! -s "$hostkey" ]; then
    ssh-keygen -q -t ed25519 -N '' -f "$hostkey"
fi
if ! id ishwork >/dev/null 2>&1; then
    adduser -D -s /bin/ash ishwork
    pass=$(head -c 32 /dev/urandom | base64)
    printf 'ishwork:%s\n' "$pass" | chpasswd
    unset pass
fi
home=/home/ishwork
mkdir -p "$home/.ssh" "$home/workspace" /run/sshd
if [ -e "$home/.ssh/authorized_keys" ]; then
    grep -Fxq "$(cat /etc/workspace-authorized.pub)" "$home/.ssh/authorized_keys" || { echo "Other pairing in use; keep this workspace unchanged."; exit 1; }
else
    cp /etc/workspace-authorized.pub "$home/.ssh/authorized_keys"
fi
chmod 0700 "$home/.ssh"
chmod 0600 "$home/.ssh/authorized_keys"
chown ishwork:ishwork "$home/.ssh" "$home/.ssh/authorized_keys" "$home/workspace"
pidfile=/run/sshd/workspace.pid
if ! { [ -s "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; }; then
    /usr/sbin/sshd -f /dev/null -p 22483 -h /etc/ssh/ssh_host_ed25519_key \
        -o PidFile="$pidfile" -o ListenAddress=127.0.0.1 -o AllowUsers=ishwork \
        -o PermitRootLogin=no -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no \
        -o DisableForwarding=yes -o AuthenticationMethods=publickey
fi
printf '%s\n' 'iSH Workspace USB host fingerprint:'
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
