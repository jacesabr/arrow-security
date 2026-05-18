'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Main, PageHeader, Card, DataTable, TR, TD, Badge } from '../../../components/ui'
import { tdApi } from '../../../lib/api'

interface Site {
  id: string
  name: string
  address: string
  city: string
  active: boolean
  geofenceRadiusMeters: number
}

export default function ClientSitesPage() {
  const router = useRouter()
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!localStorage.getItem('td_token')) { router.replace('/login'); return }
    tdApi.sites.list().then(r => setSites(r.data ?? [])).finally(() => setLoading(false))
  }, [router])

  return (
    <main style={{ flex: 1, padding: '36px 40px', overflowY: 'auto' }}>
      <PageHeader title="My Sites" subtitle="Locations under your contract" />
      <Card>
        <DataTable
          cols={['Name', 'Address', 'City', 'Geofence', 'Status']}
          loading={loading}
          empty="No sites assigned."
        >
          {sites.map(s => (
            <TR key={s.id}>
              <TD style={{ fontWeight: 600 }}>{s.name}</TD>
              <TD>{s.address}</TD>
              <TD>{s.city}</TD>
              <TD>{s.geofenceRadiusMeters ?? s.geofenceRadiusMeters}m</TD>
              <TD>
                <Badge
                  label={s.active ? 'Active' : 'Inactive'}
                  color={s.active ? '#10b981' : '#f87171'}
                  bg={s.active ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)'}
                />
              </TD>
            </TR>
          ))}
        </DataTable>
      </Card>
    </main>
  )
}
