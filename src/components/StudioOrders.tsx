import { useCallback, useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { api, ApiError } from '../lib/api'
import { formatPrice } from '../lib/format'
import { useStore } from '../state/store'
import { ORDER_STATUS_LABEL, ORDER_STATUS_NEXT, type OrderStatus, type OrderSummary } from '../types'

type Filter = 'all' | OrderStatus
const FILTERS: Filter[] = ['all', 'new', 'paid', 'shipped', 'cancelled']

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** Button label for moving an order to a status. */
const ACTION: Record<OrderStatus, string> = { new: 'Mark new', paid: 'Mark paid', shipped: 'Mark shipped', cancelled: 'Cancel order' }

/** The Studio's orders: newest first, with customer details, and status changes. */
export function StudioOrders() {
  const { sessionExpired, reloadCollection, notify } = useStore()
  const [orders, setOrders] = useState<OrderSummary[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const fail = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof ApiError && err.status === 401) sessionExpired()
      return err instanceof Error ? err.message : fallback
    },
    [sessionExpired],
  )

  const fetchOrders = useCallback(() => {
    api.listOrders().then(setOrders, (err) => setLoadError(fail(err, "The orders couldn't be loaded.")))
  }, [fail])

  useEffect(fetchOrders, [fetchOrders])

  const retry = () => {
    setLoadError(null)
    fetchOrders()
  }

  const changed = (order: OrderSummary) => {
    setOrders((list) => list?.map((o) => (o.number === order.number ? order : o)) ?? null)
    notify(`Order ${order.number} is now ${ORDER_STATUS_LABEL[order.status].toLowerCase()}`)
    // Cancelling put its paintings back on sale.
    if (order.status === 'cancelled') reloadCollection()
  }

  const shown = orders?.filter((o) => filter === 'all' || o.status === filter) ?? []
  const count = (f: Filter) => orders?.filter((o) => f === 'all' || o.status === f).length ?? 0

  return (
    <div className="flex-1 overflow-y-auto px-4 py-8 md:px-10 md:py-10">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-serif text-4xl font-light">Orders</h2>
          {orders && (
            <div role="tablist" aria-label="Filter orders by status" className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  role="tab"
                  type="button"
                  aria-selected={filter === f}
                  onClick={() => setFilter(f)}
                  className={`h-9 shrink-0 px-3 text-[13px] whitespace-nowrap transition-colors ${filter === f ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink'}`}
                >
                  {f === 'all' ? 'All' : ORDER_STATUS_LABEL[f]} <span className="tabular-nums opacity-60">{count(f)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {loadError ? (
          <div role="alert" className="mt-10 border border-dashed border-line py-16 text-center">
            <p className="text-[15px] text-ink-2">{loadError}</p>
            <button type="button" onClick={retry} className="mt-4 text-[14px] underline underline-offset-4">
              Try again
            </button>
          </div>
        ) : !orders ? (
          <div aria-busy="true" className="mt-10 space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-40 animate-pulse bg-wall" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="mt-10 border border-dashed border-line py-16 text-center">
            <p className="font-serif text-2xl">{orders.length === 0 ? 'No orders yet.' : `No ${ORDER_STATUS_LABEL[filter as OrderStatus].toLowerCase()} orders.`}</p>
            <p className="mt-2 text-[14px] text-ink-3">Orders placed through the shop's checkout appear here.</p>
          </div>
        ) : (
          <ul className="mt-8 space-y-4">
            {shown.map((order) => (
              <OrderCard key={order.number} order={order} onChanged={changed} onError={fail} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function OrderCard({
  order,
  onChanged,
  onError,
}: {
  order: OrderSummary
  onChanged: (order: OrderSummary) => void
  onError: (err: unknown, fallback: string) => string
}) {
  const [busy, setBusy] = useState<OrderStatus | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { customer } = order

  const setStatus = async (status: OrderStatus) => {
    setBusy(status)
    setError(null)
    try {
      onChanged(await api.setOrderStatus(order.number, status))
      setConfirmCancel(false)
    } catch (err) {
      setError(onError(err, "The order couldn't be updated. Try again."))
    } finally {
      setBusy(null)
    }
  }

  const next = ORDER_STATUS_NEXT[order.status]

  return (
    <motion.li layout className="bg-wall p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="font-serif text-2xl">
          {order.number}
          <span className="ml-3 font-sans text-[13px] text-ink-3">{dateFormat.format(new Date(order.createdAt))}</span>
        </p>
        <p className={`text-[13px] font-medium ${order.status === 'new' ? 'text-accent' : order.status === 'cancelled' ? 'text-ink-3' : 'text-ink'}`}>
          {ORDER_STATUS_LABEL[order.status]}
        </p>
      </div>

      <div className="mt-4 grid gap-5 text-[14px] md:grid-cols-2">
        <div className="leading-relaxed">
          <p className="text-ink">{customer.name}</p>
          <a href={`mailto:${customer.email}?subject=${encodeURIComponent(`Your ArteTotal order ${order.number}`)}`} className="text-ink-2 underline underline-offset-4">
            {customer.email}
          </a>
          <p className="mt-1 text-ink-2">
            {customer.address}, {customer.city} {customer.postcode}, {customer.country}
          </p>
        </div>
        <div>
          <ul className="space-y-1">
            {order.items.map((item) => (
              <li key={item.artworkId} className="flex justify-between gap-4">
                <span className="font-serif text-[17px] italic">{item.title}</span>
                <span className="tabular-nums text-ink-2">{formatPrice(item.price)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex justify-between border-t border-line pt-2">
            <span>Total</span>
            <span className="tabular-nums">{formatPrice(order.total)}</span>
          </p>
        </div>
      </div>

      {next.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px]">
          {confirmCancel ? (
            <>
              <span className="text-ink-2">Cancel this order? Its paintings go back on sale.</span>
              <button type="button" disabled={busy !== null} onClick={() => setStatus('cancelled')} className="font-medium text-danger hover:opacity-70 disabled:opacity-50">
                {busy === 'cancelled' ? 'Cancelling...' : 'Cancel order'}
              </button>
              <button type="button" onClick={() => setConfirmCancel(false)} className="text-ink-3 hover:text-ink">
                Keep it
              </button>
            </>
          ) : (
            next.map((status) =>
              status === 'cancelled' ? (
                <button key={status} type="button" onClick={() => setConfirmCancel(true)} className="text-ink-3 hover:text-danger">
                  {ACTION[status]}
                </button>
              ) : (
                <button
                  key={status}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => setStatus(status)}
                  className="inline-flex h-10 items-center bg-ink px-5 font-medium text-paper transition-[background-color,transform] hover:bg-ink-2 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
                >
                  {busy === status ? 'Saving...' : ACTION[status]}
                </button>
              ),
            )
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-danger">
          {error}
        </p>
      )}
    </motion.li>
  )
}
