import React, { useState, useEffect } from 'react'
import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonButton,
  IonItem,
  IonLabel,
  IonInput,
  IonTextarea,
  IonSelect,
  IonSelectOption,
  IonBackButton,
  IonButtons,
  IonSpinner,
  IonText,
  IonIcon,
} from '@ionic/react'
import { cameraOutline, trashOutline } from 'ionicons/icons'
import { useHistory } from 'react-router-dom'
import { api } from '../services/api'

export const IncidentNewPage: React.FC = () => {
  const history = useHistory()
  const [sites, setSites] = useState<any[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
  const [siteId, setSiteId] = useState('')
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.sites.list().then((res) => setSites(res.data)).catch(() => null)
  }, [])

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => setPhotoPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function submit() {
    if (!title || !description || !siteId) return
    setLoading(true)
    setError(null)
    try {
      await api.incidents.create({ siteId, title, description, severity })
      history.goBack()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const itemStyle = { '--background': '#1e293b', '--color': '#fff', borderRadius: 8, marginBottom: 12 }
  const severityColors: Record<string, string> = {
    low: '#22d3ee', medium: '#fbbf24', high: '#f97316', critical: '#ef4444',
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': '#0f172a', '--color': '#fff' }}>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/tabs/incidents" style={{ color: '#fff' }} />
          </IonButtons>
          <IonTitle>Report Incident</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': '#0f172a' }} className="ion-padding">
        {/* Site */}
        <IonItem lines="none" style={itemStyle}>
          <IonLabel style={{ color: '#94a3b8' }}>Site *</IonLabel>
          <IonSelect
            value={siteId}
            onIonChange={(e) => setSiteId(e.detail.value)}
            placeholder="Select site"
            interface="action-sheet"
            style={{ '--color': '#fff' }}
          >
            {sites.map((s) => (
              <IonSelectOption key={s.id} value={s.id}>{s.name}</IonSelectOption>
            ))}
          </IonSelect>
        </IonItem>

        {/* Title */}
        <IonItem lines="none" style={itemStyle}>
          <IonLabel position="stacked" style={{ color: '#94a3b8', marginBottom: 4 }}>Title *</IonLabel>
          <IonInput
            value={title}
            onIonInput={(e) => setTitle(e.detail.value!)}
            placeholder="Brief description of incident"
            style={{ '--color': '#fff' }}
          />
        </IonItem>

        {/* Severity */}
        <IonItem lines="none" style={itemStyle}>
          <IonLabel style={{ color: '#94a3b8' }}>Severity</IonLabel>
          <IonSelect
            value={severity}
            onIonChange={(e) => setSeverity(e.detail.value)}
            interface="action-sheet"
            style={{ '--color': severityColors[severity] }}
          >
            <IonSelectOption value="low">Low</IonSelectOption>
            <IonSelectOption value="medium">Medium</IonSelectOption>
            <IonSelectOption value="high">High</IonSelectOption>
            <IonSelectOption value="critical">Critical</IonSelectOption>
          </IonSelect>
        </IonItem>

        {/* Details */}
        <IonItem lines="none" style={{ ...itemStyle, alignItems: 'flex-start', paddingTop: 8 }}>
          <IonLabel position="stacked" style={{ color: '#94a3b8', marginBottom: 4 }}>Details *</IonLabel>
          <IonTextarea
            value={description}
            onIonInput={(e) => setDescription(e.detail.value!)}
            rows={5}
            placeholder="Describe what happened, location, people involved..."
            style={{ '--color': '#fff' }}
          />
        </IonItem>

        {/* Photo */}
        <div style={{ background: '#1e293b', borderRadius: 8, padding: 16, marginBottom: 12 }}>
          <p style={{ color: '#94a3b8', margin: '0 0 12px', fontSize: 14 }}>Photo Evidence (optional)</p>
          {photoPreview ? (
            <div style={{ position: 'relative' }}>
              <img src={photoPreview} alt="Preview" style={{ width: '100%', borderRadius: 8, maxHeight: 200, objectFit: 'cover' }} />
              <IonButton
                size="small"
                fill="clear"
                onClick={() => setPhotoPreview(null)}
                style={{ position: 'absolute', top: 4, right: 4, '--color': '#ef4444' }}
              >
                <IonIcon icon={trashOutline} />
              </IonButton>
            </div>
          ) : (
            <label style={{ display: 'block', cursor: 'pointer' }}>
              <div style={{
                border: '2px dashed #334155',
                borderRadius: 8,
                padding: 24,
                textAlign: 'center',
                color: '#64748b',
              }}>
                <IonIcon icon={cameraOutline} style={{ fontSize: 32, marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
                <span style={{ fontSize: 14 }}>Tap to add photo</span>
              </div>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={handlePhotoChange}
              />
            </label>
          )}
        </div>

        {error && <IonText color="danger"><p style={{ marginBottom: 12 }}>{error}</p></IonText>}

        <IonButton
          expand="block"
          onClick={submit}
          disabled={loading || !title || !description || !siteId}
          style={{ '--background': '#ef4444', '--border-radius': '12px', marginTop: 8, height: 52 }}
        >
          {loading ? <IonSpinner name="crescent" /> : 'Submit Incident Report'}
        </IonButton>
      </IonContent>
    </IonPage>
  )
}
