import React, { useEffect } from 'react'
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonIcon,
} from '@ionic/react'
import { BarcodeScanner } from '@capacitor-community/barcode-scanner'
import { qrCodeOutline } from 'ionicons/icons'

interface Props {
  isOpen: boolean
  onScan: (value: string) => void
  onClose: () => void
  title?: string
}

export const QrScannerModal: React.FC<Props> = ({ isOpen, onScan, onClose, title = 'Scan QR Code' }) => {
  useEffect(() => {
    if (isOpen) {
      startScan()
    } else {
      stopScan()
    }
    return () => { stopScan() }
  }, [isOpen])

  async function startScan() {
    try {
      // Check/request camera permission
      const status = await BarcodeScanner.checkPermission({ force: true })
      if (!status.granted) {
        onClose()
        return
      }
      // Make background transparent so camera shows through
      BarcodeScanner.hideBackground()
      document.body.classList.add('scanner-active')

      const result = await BarcodeScanner.startScan()
      document.body.classList.remove('scanner-active')
      BarcodeScanner.showBackground()

      if (result.hasContent) {
        onScan(result.content)
      } else {
        onClose()
      }
    } catch (err) {
      console.error('QR scan error:', err)
      document.body.classList.remove('scanner-active')
      BarcodeScanner.showBackground()
      onClose()
    }
  }

  async function stopScan() {
    try {
      await BarcodeScanner.stopScan()
      document.body.classList.remove('scanner-active')
      BarcodeScanner.showBackground()
    } catch { /* ignore */ }
  }

  function handleClose() {
    stopScan()
    onClose()
  }

  if (!isOpen) return null

  return (
    <IonModal isOpen={isOpen} onDidDismiss={handleClose}>
      <IonHeader>
        <IonToolbar style={{ '--background': '#1a1916', '--color': '#eeece8' }}>
          <IonTitle>{title}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent style={{ '--background': 'transparent' }}>
        {/* Scanner viewfinder overlay */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 24,
          padding: 24,
        }}>
          <div style={{
            width: 250,
            height: 250,
            border: '3px solid #c96442',
            borderRadius: 16,
            position: 'relative',
          }}>
            {/* Corner decorations */}
            {['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].map((corner) => (
              <div key={corner} style={{
                position: 'absolute',
                width: 24,
                height: 24,
                borderColor: '#c96442',
                borderStyle: 'solid',
                borderWidth: corner.includes('top') ? '3px 0 0 3px' : '0 3px 3px 0',
                ...(corner.includes('top') ? { top: -3 } : { bottom: -3 }),
                ...(corner.includes('Left') ? { left: -3 } : { right: -3 }),
              }} />
            ))}
            <IonIcon icon={qrCodeOutline} style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: 48,
              color: '#c9644244',
            }} />
          </div>
          <p style={{ color: '#eeece8', textAlign: 'center', margin: 0 }}>
            Point camera at QR code
          </p>
          <IonButton
            fill="outline"
            onClick={handleClose}
            style={{ '--color': '#a3a098', '--border-color': '#4a4845' }}
          >
            Cancel
          </IonButton>
        </div>
      </IonContent>
    </IonModal>
  )
}
