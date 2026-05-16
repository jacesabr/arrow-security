import React, { useState } from 'react'
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
} from '@ionic/react'
import { useHistory } from 'react-router-dom'
import { api } from '../services/api'

export const IncidentNewPage: React.FC = () => {
  const history = useHistory()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
  const [siteId, setSiteId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        <IonItem lines="full" style={itemStyle}>
          <IonLabel position="stacked" style={{ color: '#94a3b8' }}>Title *</IonLabel>
          <IonInput value={title} onIonInput={(e) => setTitle(e.detail.value!)} placeholder="Brief description of incident" />
        </IonItem>

        <IonItem lines="full" style={itemStyle}>
          <IonLabel position="stacked" style={{ color: '#94a3b8' }}>Severity *</IonLabel>
          <IonSelect value={severity} onIonChange={(e) => setSeverity(e.detail.value)} interface="action-sheet">
            <IonSelectOption value="low">Low</IonSelectOption>
            <IonSelectOption value="medium">Medium</IonSelectOption>
            <IonSelectOption value="high">High</IonSelectOption>
            <IonSelectOption value="critical">Critical</IonSelectOption>
          </IonSelect>
        </IonItem>

        <IonItem lines="full" style={itemStyle}>
          <IonLabel position="stacked" style={{ color: '#94a3b8' }}>Details *</IonLabel>
          <IonTextarea
            value={description}
            onIonInput={(e) => setDescription(e.detail.value!)}
            rows={5}
            placeholder="Describe what happened, location, people involved..."
          />
        </IonItem>

        {error && <IonText color="danger"><p>{error}</p></IonText>}

        <IonButton
          expand="block"
          onClick={submit}
          disabled={loading || !title || !description || !siteId}
          style={{ '--background': '#ef4444', '--border-radius': '12px', marginTop: 16, height: 52 }}
        >
          {loading ? <IonSpinner name="crescent" /> : 'Submit Incident Report'}
        </IonButton>
      </IonContent>
    </IonPage>
  )
}
