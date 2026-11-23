"""One bounded operation on the USB-paired developer device. No network listener."""
import asyncio
import base64
import hashlib
import io
import json
import sys
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from PIL import Image, ImageChops
from pymobiledevice3.remote.core_device.app_service import AppServiceService
from pymobiledevice3.remote.core_device.display_service import DisplayService
from pymobiledevice3.remote.core_device.pasteboard_service import PasteboardService
from pymobiledevice3.remote.core_device import hid_service as hid
from pymobiledevice3.remote.core_device.screen_capture_service import ScreenCaptureService
from pymobiledevice3.remote.core_device.screen_stream import open_media_receiver
from pymobiledevice3.remote.userspace_tunnel import UserspaceRsdTunnel
from pymobiledevice3.usbmux import list_devices

KEYS = {name: getattr(hid, 'KEY_' + key) for name, key in
        [('enter','ENTER'),('backspace','BACKSPACE'),('escape','ESC'),('tab','TAB'),
         ('left','LEFT'),('right','RIGHT'),('up','UP'),('down','DOWN')]}

def encode(im):
    out = io.BytesIO()
    im.save(out, 'PNG', compress_level=2)
    return base64.b64encode(out.getvalue()).decode('ascii')

async def capture(service):
    raw = (await service.capture_screenshot())['image']
    with Image.open(io.BytesIO(raw)) as source:
        native = source.size
        im = source.convert('RGB')
    im.thumbnail((900,900), Image.Resampling.LANCZOS)
    return im, list(native)

def changed(a, b, box, threshold):
    diff = ImageChops.difference(a.crop(box), b.crop(box))
    bands = diff.split()
    levels = ImageChops.lighter(ImageChops.lighter(bands[0], bands[1]), bands[2]).histogram()
    return sum(levels[threshold:]) / max(1, sum(levels))

def frame_matches(before, now, native, request):
    if before.size != now.size or request['native'] != native:
        return False
    w, h = now.size
    difference=changed(before, now, (0,round(h*.07),w,h), 24)
    if difference > .006:
        # Clock digits can update several rows in place. Permit a small remote
        # change only for a tap with matching control, surrounding context and chrome.
        if request['action']!='tap' or difference > .022:
            return False
        x,y=request['points'][0]
        neighborhood=(max(0,x-60),max(0,y-55),min(w,x+61),min(h,y+56))
        if (changed(before,now,neighborhood,16)>.002 or
                changed(before,now,(0,round(h*.05),w,round(h*.16)),20)>.002 or
                changed(before,now,(0,round(h*.89),w,h),20)>.002):
            return False
    for x, y in request.get('points', []):
        if not (0 <= x < w and 0 <= y < h):
            return False
        box = (max(0,x-18),max(0,y-18),min(w,x+19),min(h,y+19))
        if changed(before, now, box, 20) > .012:
            return False
    return True

@asynccontextmanager
async def control(rsd):
    # The device enforces the mirroring permission and can refuse during calls.
    # Own just this socket and service. Do not stop other clients' media streams.
    async with DisplayService(rsd) as display:
        if (await display.get_media_stream_server_status()).get('sessions'):
            raise ValueError('another_mirror_is_active')
        receiver, address = open_media_receiver(display, (1024 * 1024,))
        async def consume():
            while True:
                await receiver.recv()
        drain = None
        try:
            await asyncio.wait_for(display.start_video_stream(receiver_ip=address,
                receiver_port=receiver.port,sender_ip=rsd.service.address[0],timeout=5),10)
            drain = asyncio.create_task(consume())
            await asyncio.sleep(hid.TOUCH_AUTH_SETTLE_SECONDS)
            async with hid.UniversalHIDServiceService(rsd) as service:
                yield service
        finally:
            if drain is not None:
                drain.cancel()
                with suppress(asyncio.CancelledError,OSError):
                    await drain
            receiver.close()

async def input_action(rsd, service, request, frame, mark):
    action = request['action']
    if action in ('tap','hold','swipe','pinch'):
        points = [(round(x*65535/(frame.width-1)),round(y*65535/(frame.height-1)))
                  for x,y in request['points']]
        surface = await service.active_touchscreen_service_id()
        mark()
        if action in ('tap','hold'):
            await service.multi_tap(points, service_id=surface, hold=.65 if action=='hold' else .06)
        else:
            paths=[(*a,*b) for a,b in zip(points[::2], points[1::2])]
            await service.multi_drag(paths,steps=16,duration=.38,service_id=surface)
        return
    if action == 'paste':
        keyboard = await service.create_keyboard_service()
        async with PasteboardService(rsd) as pasteboard:
            mark()
            await pasteboard.set_text(request['text'])
        await service.send_keyboard(keyboard,(hid.KEY_LEFT_GUI,))
        await asyncio.sleep(.05)
        await service.send_keyboard(keyboard,(hid.KEY_LEFT_GUI,hid.ASCII_TO_HID['v'][0]))
        await asyncio.sleep(.06)
        await service.send_keyboard(keyboard,())
        return
    if action == 'key':
        strokes = [(KEYS[request['key']],False)]
    else:
        strokes = [hid.ASCII_TO_HID.get(c) for c in request['text']]
        if None in strokes:
            raise ValueError('keyboard_character_not_supported')
    keyboard = await service.create_keyboard_service()
    mark()
    for usage,shift in strokes:
        if shift:
            await service.send_keyboard(keyboard,(hid.KEY_LEFT_SHIFT,))
            await asyncio.sleep(.04)
        await service.send_keyboard(keyboard,(hid.KEY_LEFT_SHIFT,usage) if shift else (usage,))
        await asyncio.sleep(.04)
        await service.send_keyboard(keyboard,())
        await asyncio.sleep(.02)

async def result_frame(screens, status, stage):
    im,native=await capture(screens)
    settled=None
    if status=='dispatched':
        settled=False
        for _ in range(3):
            await asyncio.sleep(.12)
            after,geometry=await capture(screens)
            if after.size==im.size:
                box=(0,round(im.height*.07),im.width,im.height)
                settled=changed(im,after,box,20)<.002
            im,native=after,geometry
            if settled:
                break
    return {'status':status,'image':encode(im),'native':native,'screenSettled':settled,**stage}

async def main(r, config_file):
    stage = {'inputMayHaveRun':False}
    def mark():
        stage['inputMayHaveRun'] = True
    try:
        config=json.loads(config_file.read_text(encoding='utf-8-sig'))
        if config['enabled'] is not True:
            return {'status':'usb_control_disabled',**stage}
        devices=[d for d in await list_devices() if d.is_usb and
                 hashlib.sha256(d.serial.encode()).hexdigest()==config['deviceHash']==r['binding']]
        if len(devices)!=1:
            return {'status':'paired_usb_phone_missing',**stage}
        def tunnel():
            return UserspaceRsdTunnel(serial=devices[0].serial,autopair=False,remotepairing_fallback=False)
        async with tunnel() as rsd:
            action=r['action']
            if action=='status':
                async with DisplayService(rsd) as display:
                    active=bool((await display.get_media_stream_server_status()).get('sessions'))
                return {'status':'connected','mirrorActive':active,'transport':'paired_usb',**stage}
            async with ScreenCaptureService(rsd) as screens:
                status='observed'
                if action=='launch':
                    async with AppServiceService(rsd) as apps:
                        mark()
                        await apps.launch_application(r['app'],kill_existing=False)
                    await asyncio.sleep(.45)
                    status='dispatched'
                elif action!='observe':
                    before=Image.open(io.BytesIO(base64.b64decode(r['previous']))).convert('RGB')
                    async with control(rsd) as service:
                        now,native=await capture(screens)
                        if not frame_matches(before,now,native,r):
                            return {'status':'observe_again','image':encode(now),'native':native,**stage}
                        if now.width>now.height:
                            return {'status':'rotate_to_portrait_for_input',**stage}
                        await input_action(rsd,service,r,now,mark)
                        status='dispatched'
                    await asyncio.sleep(.30)
                if action not in ('type','paste','key'):
                    return await result_frame(screens,status,stage)
        # The hardware keyboard can hide the software keyboard until the owning
        # developer connection closes. Observe the layout subsequent taps will use.
        async with tunnel() as rsd:
            async with ScreenCaptureService(rsd) as screens:
                result=await result_frame(screens,'dispatched',stage)
                if action in ('type','paste'):
                    result['textDelivery']='device_keyboard_layout' if action=='type' else 'literal_via_clipboard'
                return result
    except Exception as exc:
        msg=str(exc).lower()
        if '9022' in msg or 'call is currently in progress' in msg: reason='phone_call_active'
        elif 'locked' in msg: reason='unlock_iphone'
        elif isinstance(exc,ValueError) and str(exc) in ('keyboard_character_not_supported','another_mirror_is_active'): reason=str(exc)
        else: reason=type(exc).__name__
        return {'status':'uncertain' if stage['inputMayHaveRun'] else 'unavailable','reason':reason,**stage}

if __name__=='__main__':
    print(json.dumps(asyncio.run(main(json.load(sys.stdin), Path(sys.argv[1]))),separators=(',',':')))
