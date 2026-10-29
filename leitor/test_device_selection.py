import logging
import os
from types import SimpleNamespace
from unittest.mock import patch
import leitor

service = leitor.StockflowQRService.__new__(leitor.StockflowQRService)
service.logger = logging.getLogger("device-test")
service.force_device_path = "/dev/input/by-id/usb-NT_USB_Keyboard-event-kbd"
service.validate_device_capabilities = lambda device: True
scanner = SimpleNamespace(path=os.path.realpath(service.force_device_path), name="NT USB Keyboard")
keyboard = SimpleNamespace(path="/dev/input/event999", name="Other Keyboard")
with patch.object(leitor.evdev, "list_devices", return_value=[scanner.path]), patch.object(leitor.evdev, "InputDevice", return_value=scanner):
    assert service.find_qr_device() is scanner
with patch.object(leitor.evdev, "list_devices", return_value=[keyboard.path]), patch.object(leitor.evdev, "InputDevice", return_value=keyboard):
    assert service.find_qr_device() is None
print("PASS: stable USB path selects scanner; absent scanner never selects another keyboard")
