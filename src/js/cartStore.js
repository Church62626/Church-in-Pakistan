/**
 * Global cart state for the Literature Resource Center.
 *
 * A single `reactive()` object shared by every component that imports it, so
 * adding an item on the Store page immediately updates the cart badge and the
 * Cart modal. No Pinia/Vuex needed for a store this small.
 *
 * Context: this is a church resource centre. Items are *requested* by brothers
 * and sisters and are paid for / offered through EasyPaisa, JazzCash or bank
 * transfer, then verified manually by the church office.
 */
import { reactive } from 'vue'

/** Format a PKR amount for display, e.g. 3500 -> "Rs 3,500" */
export const formatPkr = (amount) => `Rs ${Number(amount || 0).toLocaleString('en-US')}`

export const cartStore = reactive({
  /** @type {Array<{id:string,title:string,price:number,type:string,coverImage:string,quantity:number}>} */
  items: [],

  /** Number of individual pieces requested (quantities summed). */
  get count() {
    return this.items.reduce((total, item) => total + item.quantity, 0)
  },

  /** Total contribution in PKR. */
  get total() {
    return this.items.reduce((total, item) => total + item.price * item.quantity, 0)
  },

  /** The delivery address is only needed when a physical item is requested. */
  get hasPhysicalItems() {
    return this.items.some((item) => item.type === 'physical')
  },

  /** Add one unit of an item (or increment it if it is already requested). */
  add(item) {
    const existing = this.items.find((entry) => entry.id === item.id)
    if (existing) {
      existing.quantity += 1
      return existing
    }
    this.items.push({
      id: item.id,
      title: item.title,
      price: item.price,
      type: item.type,
      coverImage: item.coverImage,
      quantity: 1
    })
    return this.items[this.items.length - 1]
  },

  /** Add one more unit of an item already in the cart. */
  increment(id) {
    const existing = this.items.find((entry) => entry.id === id)
    if (existing) existing.quantity += 1
  },

  /** Remove one unit; drops the line entirely when it reaches zero. */
  decrement(id) {
    const index = this.items.findIndex((entry) => entry.id === id)
    if (index === -1) return
    if (this.items[index].quantity > 1) {
      this.items[index].quantity -= 1
    } else {
      this.items.splice(index, 1)
    }
  },

  /** Remove a line completely. */
  remove(id) {
    const index = this.items.findIndex((entry) => entry.id === id)
    if (index !== -1) this.items.splice(index, 1)
  },

  /** Empty the cart (used after a successful request). */
  clear() {
    this.items.splice(0, this.items.length)
  }
})
