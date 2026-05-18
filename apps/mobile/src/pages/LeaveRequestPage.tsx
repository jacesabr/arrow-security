import React, { useEffect, useRef, useState } from 'react'
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonFab,
  IonFabButton,
  IonIcon,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonModal,
  IonButton,
  IonInput,
  IonTextarea,
  IonSelect,
  IonSelectOption,
  IonSkeletonText,
  IonToast,
} from '@ionic/react'
import { calendarOutline, addOutline, closeOutline, timeOutline } from 'ionicons/icons'
import { api } from '../services/api'

const LEAVE_TYPE_LABELS: Record<string, string> = {
  casual: 'Casual Leave',
  sick: 'Sick Leave',
  earned: 'Earned Leave',
  unpaid: 'Unpaid Leave',
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  approved: '#10b981',
  rejected: '#ef4444',
  cancelled: '#9a9490',
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function dayCount(start: string, end: string): number {
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  if (isNaN(s) || isNaN(e) || e < s) return 1
  return Math.ceil((e - s) / 86400000) + 1
}

export const LeaveRequestPage: React.FC = () => {
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [toastColor, setToastColor] = useState<string>('danger')

  // Form state
  const [leaveType, setLeaveType] = useState<string>('casual')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [reason, setReason] = useState<string>('')

  const modalRef = useRef<HTMLIonModalElement>(null)

  const showError = (msg: string) => {
    setToastColor('danger')
    setToastMsg(msg)
  }

  const showSuccess = (msg: string) => {
    setToastColor('success')
    setToastMsg(msg)
  }

  async function loadRequests() {
    try {
      setLoading(true)
      const res = await api.leaveRequests.list()
      const sorted = [...(res.data ?? [])].sort(
        (a: any, b: any) => new Date(b.createdAt ?? b.startDate).getTime() - new Date(a.createdAt ?? a.startDate).getTime()
      )
      setRequests(sorted)
    } catch (e: any) {
      showError(e?.message ?? 'Failed to load leave requests')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRequests()
  }, [])

  function resetForm() {
    setLeaveType('casual')
    setStartDate('')
    setEndDate('')
    setReason('')
  }

  async function handleSubmit() {
    if (!startDate) { showError('Please select a start date'); return }
    if (!endDate) { showError('Please select an end date'); return }
    if (new Date(endDate) < new Date(startDate)) {
      showError('End date must be on or after start date')
      return
    }
    try {
      setSubmitting(true)
      await api.leaveRequests.create({ leaveType, startDate, endDate, reason: reason || undefined })
      showSuccess('Leave request submitted')
      setShowModal(false)
      resetForm()
      await loadRequests()
    } catch (e: any) {
      showError(e?.message ?? 'Failed to submit request')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel(id: string) {
    try {
      setCancelling(id)
      await api.leaveRequests.cancel(id)
      showSuccess('Request cancelled')
      await loadRequests()
    } catch (e: any) {
      showError(e?.message ?? 'Failed to cancel request')
    } finally {
      setCancelling(null)
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar style={{ '--background': '#ffffff', '--color': '#1a1916' } as any}>
          <IonTitle style={{ color: '#1a1916' }}>Leave Requests</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent style={{ '--background': '#fafaf9' } as any}>
        {/* Loading skeletons */}
        {loading && (
          <div style={{ padding: '12px 16px' }}>
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                style={{
                  background: '#ffffff',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 8,
                }}
              >
                <IonSkeletonText animated style={{ width: '60%', height: 16, marginBottom: 8 }} />
                <IonSkeletonText animated style={{ width: '80%', height: 14 }} />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && requests.length === 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              paddingTop: 80,
              color: '#9a9490',
            }}
          >
            <IonIcon icon={calendarOutline} style={{ fontSize: 56, marginBottom: 16 }} />
            <p style={{ margin: 0, fontSize: 16 }}>No leave requests yet</p>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#e8e5e0' }}>
              Tap + to submit a new request
            </p>
          </div>
        )}

        {/* Request cards */}
        {!loading && requests.length > 0 && (
          <div style={{ padding: '12px 16px 80px' }}>
            {requests.map((req: any) => {
              const typeLabel = LEAVE_TYPE_LABELS[req.leaveType] ?? req.leaveType ?? 'Leave'
              const statusColor = STATUS_COLORS[req.status] ?? '#5c5855'
              const days = dayCount(req.startDate, req.endDate)
              const dateRange = `${formatDate(req.startDate)} – ${formatDate(req.endDate)} (${days} day${days !== 1 ? 's' : ''})`

              return (
                <div
                  key={req.id}
                  style={{
                    background: '#ffffff',
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 8,
                    border: '1px solid #e8e5e0',
                  }}
                >
                  {/* Top row: type + status */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ color: '#1a1916', fontWeight: 600, fontSize: 15 }}>
                      {typeLabel}
                    </span>
                    <span
                      style={{
                        background: statusColor + '22',
                        color: statusColor,
                        border: `1px solid ${statusColor}55`,
                        borderRadius: 20,
                        padding: '2px 10px',
                        fontSize: 12,
                        fontWeight: 600,
                        textTransform: 'capitalize',
                      }}
                    >
                      {req.status ?? 'pending'}
                    </span>
                  </div>

                  {/* Date range */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      color: '#5c5855',
                      fontSize: 13,
                      marginBottom: req.reason ? 6 : 0,
                    }}
                  >
                    <IonIcon icon={timeOutline} style={{ fontSize: 14, flexShrink: 0 }} />
                    <span>{dateRange}</span>
                  </div>

                  {/* Reason */}
                  {req.reason && (
                    <p
                      style={{
                        margin: '4px 0 0',
                        color: '#9a9490',
                        fontSize: 13,
                        lineHeight: 1.4,
                      }}
                    >
                      {req.reason}
                    </p>
                  )}

                  {/* Cancel button — only for pending */}
                  {req.status === 'pending' && (
                    <div style={{ marginTop: 12 }}>
                      <IonButton
                        size="small"
                        fill="outline"
                        color="medium"
                        disabled={cancelling === req.id}
                        onClick={() => handleCancel(req.id)}
                        style={{ '--border-color': '#e8e5e0', '--color': '#5c5855' } as any}
                      >
                        {cancelling === req.id ? 'Cancelling…' : 'Cancel Request'}
                      </IonButton>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* FAB */}
        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton
            onClick={() => setShowModal(true)}
            style={{ '--background': '#c96442', '--background-activated': '#a84f33' } as any}
          >
            <IonIcon icon={addOutline} />
          </IonFabButton>
        </IonFab>

        {/* New Request Modal */}
        <IonModal
          ref={modalRef}
          isOpen={showModal}
          onDidDismiss={() => { setShowModal(false); resetForm() }}
          style={{ '--border-radius': '16px' } as any}
        >
          <IonHeader>
            <IonToolbar style={{ '--background': '#ffffff', '--color': '#1a1916' } as any}>
              <IonTitle style={{ color: '#1a1916' }}>New Leave Request</IonTitle>
              <IonButton
                slot="end"
                fill="clear"
                onClick={() => { setShowModal(false); resetForm() }}
                style={{ '--color': '#5c5855' } as any}
              >
                <IonIcon icon={closeOutline} slot="icon-only" />
              </IonButton>
            </IonToolbar>
          </IonHeader>

          <IonContent style={{ '--background': '#fafaf9' } as any}>
            <div style={{ padding: '16px 20px 32px' }}>

              {/* Leave Type */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', color: '#9a9490', fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Leave Type
                </label>
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: 10,
                    border: '1px solid #e8e5e0',
                    overflow: 'hidden',
                  }}
                >
                  <IonSelect
                    value={leaveType}
                    onIonChange={(e) => setLeaveType(e.detail.value)}
                    interface="action-sheet"
                    style={{
                      '--color': '#1a1916',
                      '--placeholder-color': '#9a9490',
                      '--padding-start': '14px',
                      '--padding-end': '14px',
                    } as any}
                  >
                    <IonSelectOption value="casual">Casual Leave</IonSelectOption>
                    <IonSelectOption value="sick">Sick Leave</IonSelectOption>
                    <IonSelectOption value="earned">Earned Leave</IonSelectOption>
                    <IonSelectOption value="unpaid">Unpaid Leave</IonSelectOption>
                  </IonSelect>
                </div>
              </div>

              {/* Start Date */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', color: '#9a9490', fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Start Date
                </label>
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: 10,
                    border: '1px solid #e8e5e0',
                    overflow: 'hidden',
                  }}
                >
                  <IonInput
                    type="date"
                    value={startDate}
                    onIonInput={(e) => setStartDate(e.detail.value as string)}
                    style={{
                      '--color': '#1a1916',
                      '--placeholder-color': '#9a9490',
                      '--padding-start': '14px',
                      '--padding-end': '14px',
                    } as any}
                  />
                </div>
              </div>

              {/* End Date */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', color: '#9a9490', fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  End Date
                </label>
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: 10,
                    border: '1px solid #e8e5e0',
                    overflow: 'hidden',
                  }}
                >
                  <IonInput
                    type="date"
                    value={endDate}
                    onIonInput={(e) => setEndDate(e.detail.value as string)}
                    style={{
                      '--color': '#1a1916',
                      '--placeholder-color': '#9a9490',
                      '--padding-start': '14px',
                      '--padding-end': '14px',
                    } as any}
                  />
                </div>
              </div>

              {/* Day count preview */}
              {startDate && endDate && new Date(endDate) >= new Date(startDate) && (
                <div
                  style={{
                    background: '#c9644222',
                    border: '1px solid #c9644244',
                    borderRadius: 8,
                    padding: '8px 14px',
                    marginBottom: 20,
                    color: '#c96442',
                    fontSize: 13,
                  }}
                >
                  {dayCount(startDate, endDate)} day{dayCount(startDate, endDate) !== 1 ? 's' : ''} requested
                </div>
              )}

              {/* Reason */}
              <div style={{ marginBottom: 28 }}>
                <label style={{ display: 'block', color: '#9a9490', fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Reason <span style={{ color: '#e8e5e0' }}>(optional)</span>
                </label>
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: 10,
                    border: '1px solid #e8e5e0',
                    overflow: 'hidden',
                  }}
                >
                  <IonTextarea
                    rows={3}
                    value={reason}
                    onIonInput={(e) => setReason(e.detail.value as string)}
                    placeholder="Add a note for your supervisor…"
                    style={{
                      '--color': '#1a1916',
                      '--placeholder-color': '#e8e5e0',
                      '--padding-start': '14px',
                      '--padding-end': '14px',
                      '--padding-top': '12px',
                      '--padding-bottom': '12px',
                    } as any}
                  />
                </div>
              </div>

              {/* Submit */}
              <IonButton
                expand="block"
                disabled={submitting}
                onClick={handleSubmit}
                style={{
                  '--background': '#c96442',
                  '--background-activated': '#a84f33',
                  '--border-radius': '10px',
                  '--color': '#fff',
                  fontWeight: 600,
                  fontSize: 16,
                } as any}
              >
                {submitting ? 'Submitting…' : 'Request Leave'}
              </IonButton>
            </div>
          </IonContent>
        </IonModal>

        {/* Toast */}
        <IonToast
          isOpen={toastMsg !== null}
          message={toastMsg ?? ''}
          duration={3000}
          color={toastColor}
          onDidDismiss={() => setToastMsg(null)}
          position="bottom"
        />
      </IonContent>
    </IonPage>
  )
}
