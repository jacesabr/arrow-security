import React, { useEffect, useRef } from 'react'
import { IonModal, IonHeader, IonToolbar, IonTitle, IonContent, IonButton } from '@ionic/react'
import { Html5Qrcode } from 'html5-qrcode'

interface Props {
  isOpen: boolean
  onScan: (value: string) => void
  onClose: () => void
  title?: string
}

export const QrScannerModal: React.FC<Props> = ({ isOpen, onScan, onClose, title = 'Scan QR Code' }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerId = 'qr-scan-container'

  useEffect(() => {
    if (!isOpen) return

    const timer = setTimeout(() => {
      const scanner = new Html5Qrcode(containerId)
      scannerRef.current = scanner

      scanner
        .start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            stopScanner()
            onScan(decodedText)
          },
          undefined,
        )
        .catch(console.error)
    }, 300)

    return () => clearTimeout(timer)
  }, [isOpen])

  function stopScanner() {
    if (scannerRef.current?.isScanning) {
      scannerRef.current.stop().catch(console.error)
    }
    scannerRef.current = null
  }

  function handleClose() {
    stopScanner()
    onClose()
  }

  return (
    <IonModal isOpen={isOpen} onDidDismiss={handleClose}>
      <IonHeader>
        <IonToolbar style={{ '--background': '#0f172a', '--color': '#fff' }}>
          <IonTitle>{title}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent style={{ '--background': '#0f172a' }}>
        <div style={{ padding: 16 }}>
          <div
            id={containerId}
            style={{ width: '100%', borderRadius: 12, overflow: 'hidden' }}
          />
          <p style={{ color: '#64748b', textAlign: 'center', marginTop: 16, fontSize: 14 }}>
            Point the camera at a QR code to scan
          </p>
        </div>
        <div style={{ padding: '0 16px' }}>
          <IonButton
            expand="block"
            fill="outline"
            onClick={handleClose}
            style={{ '--color': '#94a3b8', '--border-color': '#334155' }}
          >
            Cancel
          </IonButton>
        </div>
      </IonContent>
    </IonModal>
  )
}
