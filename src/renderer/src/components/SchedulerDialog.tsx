import { useEffect, useState } from 'react'
import type { PostAction, Queue } from '@shared/types'
import { useStore } from '../store'
import { useI18n } from '../i18n'
import { Icon } from '../icons'
import { Button, Field, Modal, NumberInput, Toggle, toast } from './ui'

const ACTIONS: PostAction[] = ['none', 'sleep', 'shutdown', 'quit']

export function SchedulerDialog({ onClose }: { onClose: () => void }) {
  const { queues, downloads } = useStore()
  const { t, queue } = useI18n()
  const [selectedId, setSelectedId] = useState(queues.find((q) => q.id === 'scheduled')?.id ?? queues[0]?.id)
  const selected = queues.find((q) => q.id === selectedId) ?? queues[0]
  const [draft, setDraft] = useState<Queue | null>(selected ? structuredClone(selected) : null)

  useEffect(() => {
    if (selected) setDraft(structuredClone(selected))
  }, [selectedId])

  // Kuyruğun çalışma durumu dışarıdan değişirse (zamanlayıcı) taslağa yansıt.
  useEffect(() => {
    if (selected && draft && selected.running !== draft.running) setDraft({ ...draft, running: selected.running })
  }, [selected?.running])

  const days = t('dayNames').split(',')
  const countIn = (id: string) => [...downloads.values()].filter((d) => d.queueId === id && d.status !== 'completed').length

  const save = async () => {
    if (!draft) return
    await window.api.setQueue(draft)
    toast(t('save') + ' ✓')
  }

  return (
    <Modal
      title={t('schedulerTitle')}
      onClose={onClose}
      width={760}
      footer={
        <>
          <div className="spacer" />
          <Button onClick={onClose}>{t('close')}</Button>
          <Button variant="primary" onClick={() => void save()}>
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="settings">
        <nav className="settings-nav">
          {queues.map((q) => (
            <button key={q.id} className={q.id === selected?.id ? 'active' : ''} onClick={() => setSelectedId(q.id)}>
              <span className={`dot ${q.running ? 'dot-on' : ''}`} />
              <span className="grow">{queue(q)}</span>
              <span className="muted small">{countIn(q.id)}</span>
            </button>
          ))}
          <button
            onClick={async () => {
              const q: Queue = {
                id: crypto.randomUUID(),
                name: t('newQueue'),
                running: false,
                maxConcurrent: 2,
                onComplete: 'none',
                schedule: { enabled: false, startTime: '02:00', stopTime: '', days: [] }
              }
              await window.api.setQueue(q)
              setSelectedId(q.id)
            }}
          >
            <Icon name="plus" size={15} /> {t('newQueue')}
          </button>
        </nav>

        {draft && (
          <div className="settings-body stack">
            <div className="row gap-s">
              <span className={`badge ${draft.running ? 'badge-ok' : ''}`}>{draft.running ? t('running') : t('stopped')}</span>
              <div className="spacer" />
              {draft.running ? (
                <Button icon="pause" onClick={() => void window.api.stopQueue(draft.id)}>
                  {t('stopQueue')}
                </Button>
              ) : (
                <Button icon="play" onClick={() => void window.api.startQueue(draft.id)}>
                  {t('startQueue')}
                </Button>
              )}
              {!draft.builtin && (
                <Button
                  icon="trash"
                  variant="danger"
                  onClick={async () => {
                    await window.api.deleteQueue(draft.id)
                    setSelectedId(queues[0]?.id)
                  }}
                >
                  {t('delete')}
                </Button>
              )}
            </div>

            <div className="grid-2">
              <Field label={t('queueName')}>
                <input className="input" value={draft.builtin ? queue(draft) : draft.name} disabled={draft.builtin} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </Field>
              <Field label={t('queueMaxConcurrent')}>
                <NumberInput value={draft.maxConcurrent} min={0} max={20} onChange={(v) => setDraft({ ...draft, maxConcurrent: v })} />
              </Field>
            </div>

            <Toggle checked={draft.schedule.enabled} onChange={(v) => setDraft({ ...draft, schedule: { ...draft.schedule, enabled: v } })} label={t('scheduleEnabled')} />

            <div className="grid-2">
              <Field label={t('startTime')}>
                <input
                  className="input"
                  type="time"
                  value={draft.schedule.startTime}
                  disabled={!draft.schedule.enabled}
                  onChange={(e) => setDraft({ ...draft, schedule: { ...draft.schedule, startTime: e.target.value } })}
                />
              </Field>
              <Field label={t('stopTime')}>
                <input
                  className="input"
                  type="time"
                  value={draft.schedule.stopTime}
                  disabled={!draft.schedule.enabled}
                  onChange={(e) => setDraft({ ...draft, schedule: { ...draft.schedule, stopTime: e.target.value } })}
                />
              </Field>
            </div>

            <Field label={t('days')}>
              <div className="days">
                {days.map((d, i) => {
                  const on = draft.schedule.days.includes(i)
                  return (
                    <button
                      key={i}
                      type="button"
                      className={on ? 'day active' : 'day'}
                      disabled={!draft.schedule.enabled}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          schedule: { ...draft.schedule, days: on ? draft.schedule.days.filter((x) => x !== i) : [...draft.schedule.days, i].sort() }
                        })
                      }
                    >
                      {d}
                    </button>
                  )
                })}
              </div>
            </Field>

            <Field label={t('onComplete')}>
              <select className="input" value={draft.onComplete} onChange={(e) => setDraft({ ...draft, onComplete: e.target.value as PostAction })}>
                {ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {t(`post.${a}`)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </div>
    </Modal>
  )
}
