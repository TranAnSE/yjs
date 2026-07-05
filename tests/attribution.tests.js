/**
 * Testing if encoding/decoding compatibility and integration compatibility is given.
 * We expect that the document always looks the same, even if we upgrade the integration algorithm, or add additional encoding approaches.
 *
 * The v1 documents were generated with Yjs v13.2.0 based on the randomisized tests.
 */

import * as Y from '../src/index.js'
import * as t from 'lib0/testing'
import * as delta from 'lib0/delta'
import * as prng from 'lib0/prng'
import * as math from 'lib0/math'
import { bind, $rdt } from 'lib0/delta/rdt'
import { init } from './testHelper.js' // eslint-disable-line

/**
 * @param {t.TestCase} _tc
 */
export const testRelativePositions = _tc => {
  const ydoc = new Y.Doc()
  const ytext = ydoc.get()
  ytext.insert(0, 'hello world')
  const v1 = Y.cloneDoc(ydoc)
  ytext.delete(1, 6)
  ytext.insert(1, 'x')
  const renderer = Y.createDiffRenderer(v1, ydoc)
  const rel = Y.createRelativePositionFromTypeIndex(ytext, 9, 1, renderer) // pos after "hello wo"
  const abs1 = Y.createAbsolutePositionFromRelativePosition(rel, ydoc, true, renderer)
  const abs2 = Y.createAbsolutePositionFromRelativePosition(rel, ydoc, true)
  t.assert(abs1?.index === 9)
  t.assert(abs2?.index === 3)
}

/**
 * @param {t.TestCase} _tc
 */
export const testAttributedEvents = _tc => {
  const ydoc = new Y.Doc()
  const ytext = ydoc.get()
  ytext.insert(0, 'hello world')
  const v1 = Y.cloneDoc(ydoc)
  ydoc.transact(() => {
    ytext.delete(6, 5)
  })
  const renderer = Y.createDiffRenderer(v1, ydoc)
  const c1 = ytext.toDelta({ renderer })
  t.compare(c1, delta.create().insert('hello ').insert('world', null, { delete: [] }).done())
  let calledObserver = false
  ytext.observe(event => {
    const d = event.getDelta({ renderer })
    t.compare(d, delta.create().retain(11).insert('!', null, { insert: [] }).done())
    calledObserver = true
  })
  ytext.applyDelta(delta.create().retain(11).insert('!').done(), null, { renderer })
  t.assert(calledObserver)
}

/**
 * @param {t.TestCase} _tc
 */
export const testInsertionsMindingAttributedContent = _tc => {
  const ydoc = new Y.Doc()
  const ytext = ydoc.get()
  ytext.insert(0, 'hello world')
  const v1 = Y.cloneDoc(ydoc)
  ydoc.transact(() => {
    ytext.delete(6, 5)
  })
  const renderer = Y.createDiffRenderer(v1, ydoc)
  const c1 = ytext.toDelta({ renderer })
  t.compare(c1, delta.create().insert('hello ').insert('world', null, { delete: [] }).done())
  ytext.applyDelta(delta.create().retain(11).insert('content').done(), null, { renderer })
  t.assert(ytext.toString() === 'hello content')
}

/**
 * @param {t.TestCase} _tc
 */
export const testInsertionsIntoAttributedContent = _tc => {
  const ydoc = new Y.Doc()
  const ytext = ydoc.get()
  ytext.insert(0, 'hello ')
  const v1 = Y.cloneDoc(ydoc)
  ydoc.transact(() => {
    ytext.insert(6, 'word')
  })
  const renderer = Y.createDiffRenderer(v1, ydoc)
  const c1 = ytext.toDelta({ renderer })
  t.compare(c1, delta.create().insert('hello ').insert('word', null, { insert: [] }).done())
  ytext.applyDelta(delta.create().retain(9).insert('l').done(), null, { renderer })
  t.assert(ytext.toString() === 'hello world')
}

export const testYdocDiff = () => {
  const ydocStart = new Y.Doc()
  ydocStart.get('text').insert(0, 'hello')
  ydocStart.get('array').insert(0, [1, 2, 3])
  ydocStart.get('map').setAttr('k', 42)
  ydocStart.get('map').setAttr('nested', new Y.Type())
  const ydocUpdated = Y.cloneDoc(ydocStart)
  ydocUpdated.get('text').insert(5, ' world')
  ydocUpdated.get('array').insert(1, ['x'])
  ydocUpdated.get('map').setAttr('newk', 42)
  ydocUpdated.get('map').getAttr('nested').insert(0, [1])
  // @todo add custom attribution
  const d = Y.diffDocsToDelta(ydocStart, ydocUpdated).done()
  console.log('calculated diff', d.toJSON())
  const expected = delta.create()
    .modifyAttr('text', delta.create().retain(5).insert(' world', null, { insert: [] }))
    .modifyAttr('array', delta.create().retain(1).insert(['x'], null, { insert: [] }))
    .modifyAttr('map', delta.create().setAttr('newk', 42, { insert: [] }).modifyAttr('nested', delta.create().insert([1], null, { insert: [] })))
  const expectedDone = expected.done()
  t.compare(d, expectedDone)
}

export const testChildListContent = () => {
  const ydocStart = new Y.Doc()
  const ydocUpdated = Y.cloneDoc(ydocStart)
  const yf = new Y.Type('test')
  let calledEvent = 0
  yf.applyDelta(delta.create().insert('test content').setAttr('k', 'v').done())

  const yarray = ydocUpdated.get('array')
  yarray.observeDeep(event => {
    calledEvent++
    const d = event.deltaDeep
    const expectedD = delta.create().insert([delta.create('test').insert('test content').setAttr('k', 'v')])
    t.compare(d, expectedD)
  })
  ydocUpdated.get('array').insert(0, [yf])
  t.assert(calledEvent === 1)
  const d = Y.diffDocsToDelta(ydocStart, ydocUpdated)
  console.log('calculated diff', d.toJSON())
  const expected = delta.create()
    .modifyAttr('array', delta.create().insert([delta.create('test').insert('test content', null, { insert: [] }).setAttr('k', 'v', { insert: [] })], null, { insert: [] }).done())
  t.compare(d.done(), expected.done())
}

/**
 * @param {t.TestCase} tc
 */
export const testAttributionSession1 = tc => {
  const { testConnector, users, text0, text1 } = init(tc, { users: 3 })
  users[0].gc = false
  const globalAttributions = new Y.Attributions()
  const v1 = Y.cloneDoc(users[0])
  users.forEach(user => user.on('update', (update, _, ydoc, tr) => {
    if (!tr.local) return
    const userid = ydoc.clientID.toString()
    const contentIds = Y.createContentIdsFromUpdate(update)
    Y.insertIntoIdMap(globalAttributions.inserts, Y.createIdMapFromIdSet(contentIds.inserts, [Y.createContentAttribute('insert', userid)]))
    Y.insertIntoIdMap(globalAttributions.deletes, Y.createIdMapFromIdSet(contentIds.deletes, [Y.createContentAttribute('delete', userid)]))
  }))
  text0.insert(0, 'a')
  text1.insert(0, 'b')
  testConnector.flushAllMessages()
  const d1 = text0.toDelta({ renderer: Y.createDiffRenderer(v1, users[0], { attrs: globalAttributions }) })
  t.compare(d1, delta.create().insert('a', null, { insert: ['0'] }).insert('b', null, { insert: ['1'] }).done())
  const v2 = Y.cloneDoc(users[0])
  text0.delete(1, 1)
  text1.insert(2, 'c')
  testConnector.flushAllMessages()
  const d2 = text0.toDelta({ renderer: Y.createDiffRenderer(v2, users[0], { attrs: globalAttributions }) })
  t.compare(d2, delta.create().insert('a').insert('b', null, { delete: ['0'] }).insert('c', null, { insert: ['1'] }).done())

  const onlyUser0ChangesAttributed = {
    inserts: Y.filterIdMap(globalAttributions.inserts, attrs => attrs.some(attr => attr.name === 'insert' && attr.val === '0')),
    deletes: Y.filterIdMap(globalAttributions.deletes, attrs => attrs.some(attr => attr.name === 'delete' && attr.val === '0'))
  }
  const rendererUser0 = new Y.TwosetRenderer(onlyUser0ChangesAttributed.inserts, onlyUser0ChangesAttributed.deletes)
  const d3 = text0.toDelta({ renderer: rendererUser0 })
  t.compare(d3, delta.create().insert('a', null, { insert: ['0'] }).insert('b', null, { delete: ['0'] }).insert('c').done())
  Y.undoContentIds(users[0], Y.createContentIdsFromContentMap(onlyUser0ChangesAttributed))

  const d4 = text0.toDelta()
  t.compare(d4, delta.create().insert('bc').done())
}

export const testAttributionEvent = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get()
  // <p>hi</p>
  ytype.applyDelta(delta.create().insert([delta.create('p').insert('hi').done()]).done())
  const ydocBase = Y.cloneDoc(ydoc)
  const renderer = Y.createDiffRenderer(ydocBase, ydoc)
  let called = false
  ytype.observeDeep(event => {
    const change = event.getDelta({ renderer })
    const expectedChange = delta.create().modify(delta.create('p').retain(2, null, { delete: [] }), null, { delete: [] }).done()
    t.compare(
      change,
      expectedChange
    )
    called = true
  })
  // delete <p>
  // we expect that the children get attributions as well
  ytype.delete(0, 1)
  t.assert(called)
}

export const testAttributionChange = () => {
  const ydoc = new Y.Doc()
  const ytype = ydoc.get()
  ytype.applyDelta(delta.create().insert('hi').done())
  const ydocClone = Y.cloneDoc(ydoc)
  const renderer = Y.createDiffRenderer(ydocClone, ydoc)
  ytype.applyDelta(delta.create().retain(2).insert('!').done())
  let calledHandler = false
  renderer.on('change', changes => {
    calledHandler = true
    const changeUpdate = ytype.toDelta({ renderer, deep: true, itemsToRender: changes, retainInserts: true, retainDeletes: true })
    // the '!' lost its `{ insert: [] }` suggestion attribution → the change clears it (tri-state `null`)
    const expectedUpdate = delta.create().retain(2).retain(1, undefined, null)
    t.compare(changeUpdate, expectedUpdate)
  })
  Y.applyUpdate(ydocClone, Y.encodeStateAsUpdate(ydoc))
  t.assert(calledHandler)
}

/**
 * A YType implements the lib0 `RDT` interface, so two types can be kept in sync with `bind`.
 */
export const testRdtBinding = () => {
  const docA = new Y.Doc()
  const docB = new Y.Doc()
  const a = docA.get('text')
  const b = docB.get('text')
  const binding = bind(a, b)
  // edit A -> propagates to B
  a.insert(0, 'hello')
  t.assert(b.toString() === 'hello')
  // edit B -> propagates back to A (no echo loop)
  b.insert(5, ' world')
  t.assert(a.toString() === 'hello world')
  t.assert(b.toString() === 'hello world')
  // after the binding is destroyed, changes no longer propagate
  binding.destroy()
  a.insert(0, 'x')
  t.assert(a.toString() === 'xhello world')
  t.assert(b.toString() === 'hello world')
}

/**
 * Local changes are emitted on the `'delta'` channel as the deep delta.
 */
export const testRdtDeltaEvent = () => {
  const ydoc = new Y.Doc()
  const ytext = ydoc.get()
  /**
   * @type {any}
   */
  let captured = null
  ytext.on('delta', d => { captured = d })
  ytext.insert(0, 'hello')
  t.compare(captured, delta.create().insert('hello').done())
}

/**
 * The `'delta'` event carries the transaction origin as its second argument.
 */
export const testRdtDeltaEventOrigin = () => {
  const ydoc = new Y.Doc()
  const ytext = ydoc.get()
  /**
   * @type {any}
   */
  let capturedOrigin = null
  ytext.on('delta', (_d, origin) => { capturedOrigin = origin })
  const myOrigin = {}
  ydoc.transact(() => {
    ytext.insert(0, 'hello')
  }, myOrigin)
  t.assert(capturedOrigin === myOrigin)
  // without an explicit origin, `null` is emitted
  capturedOrigin = myOrigin
  ytext.insert(5, ' world')
  t.assert(capturedOrigin === null)
  // the origin passed to `applyDelta` becomes the transaction origin and is forwarded on the event
  const applyOrigin = {}
  ytext.applyDelta(delta.create().retain(11).insert('!').done(), applyOrigin)
  t.assert(capturedOrigin === applyOrigin)
  // `applyDelta` without an explicit origin emits `null`
  capturedOrigin = applyOrigin
  ytext.applyDelta(delta.create().retain(12).insert('?').done())
  t.assert(capturedOrigin === null)
}

/**
 * `useRenderer` changes the default renderer used by `toDelta` (and friends). Calling `toDelta()`
 * with no argument afterwards is equivalent to passing the renderer explicitly.
 */
export const testUseRenderer = () => {
  const ydoc = new Y.Doc()
  const ytext = ydoc.get()
  ytext.insert(0, 'hello world')
  const v1 = Y.cloneDoc(ydoc)
  ydoc.transact(() => {
    ytext.delete(6, 5)
  })
  const renderer = Y.createDiffRenderer(v1, ydoc)
  const explicit = ytext.toDelta({ renderer })
  // change the default renderer; toDelta() with no arg now matches the explicit form
  ytext.useRenderer(renderer)
  const viaDefault = ytext.toDelta()
  t.compare(viaDefault, explicit)
  t.compare(viaDefault, delta.create().insert('hello ').insert('world', null, { delete: [] }).done())
}

/**
 * `destroy()` emits the RDT `'destroy'` event, and top-level types are destroyed with their Doc.
 */
export const testRdtDestroy = () => {
  const ydoc = new Y.Doc()
  const ytext = ydoc.get('text')
  let destroyed = 0
  ytext.on('destroy', () => { destroyed++ })
  ytext.destroy()
  t.assert(destroyed === 1)
  // a top-level type is torn down when its Doc is destroyed
  const ydoc2 = new Y.Doc()
  const ytext2 = ydoc2.get('text')
  let destroyed2 = 0
  ytext2.on('destroy', () => { destroyed2++ })
  ydoc2.destroy()
  t.assert(destroyed2 === 1)
}

/**
 * The `'delta'` event bubbles to ancestors on nested changes, like `observeDeep`. A listener on a
 * container fires (with the container-rooted delta) when a nested child is edited.
 */
export const testRdtDeltaBubblesLikeObserveDeep = () => {
  const ydoc = new Y.Doc()
  const yarray = ydoc.get('arr')
  const child = new Y.Type()
  yarray.insert(0, [child])
  let containerFired = 0
  let childFired = 0
  /**
   * @type {any}
   */
  let captured = null
  yarray.on('delta', d => { containerFired++; captured = d })
  child.on('delta', () => { childFired++ })
  child.insert(0, 'hi')
  // both the edited child and its ancestor container received a 'delta'
  t.assert(childFired === 1)
  t.assert(containerFired === 1)
  // the container-rooted delta is a non-empty (nested modify) change
  t.assert(captured !== null && !captured.isEmpty())
}

/**
 * `get delta()` returns the deep delta and keeps it current on every event of this type, including
 * nested-child edits (which apply as a nested `modify`). The returned value is the live cache.
 */
export const testRdtDeltaCacheMaintenance = () => {
  const ydoc = new Y.Doc()
  const ytext = ydoc.get('text')
  ytext.insert(0, 'hello')
  // first access materializes the cache
  t.assert(ytext.delta.equals(delta.create().insert('hello').done()))
  // a later edit updates the live cache in place
  const live = ytext.delta
  ytext.insert(5, ' world')
  t.assert(live === ytext.delta) // same maintained object
  t.assert(ytext.delta.equals(delta.create().insert('hello world').done()))
  t.assert(ytext.delta.equals(ytext.toDeltaDeep())) // matches a fresh deep render

  // nested: editing a child updates the container's cached deep delta via a nested modify apply
  const yarray = ydoc.get('arr')
  const child = new Y.Type()
  yarray.insert(0, [child])
  child.insert(0, 'a')
  const before = yarray.delta // materialize under base renderer
  child.insert(1, 'b') // nested edit after materialization
  t.assert(before === yarray.delta)
  t.assert(yarray.delta.equals(yarray.toDeltaDeep()))
}

/**
 * `clearCache()` drops the maintained deep delta; the next `delta` access re-materializes it.
 */
export const testRdtClearCache = () => {
  const ydoc = new Y.Doc()
  const ytext = ydoc.get('text')
  ytext.insert(0, 'hello')
  const d1 = ytext.delta
  t.assert(ytext._delta !== null)
  ytext.clearCache()
  t.assert(ytext._delta === null)
  const d2 = ytext.delta // re-materialized, a fresh builder
  t.assert(d2 !== d1)
  t.assert(d2.equals(delta.create().insert('hello').done()))
}

/**
 * `useRenderer` re-renders the maintained delta with the new renderer, emits the difference on the
 * `'delta'` channel, and updates the cache.
 */
export const testRdtUseRendererEmitsDiff = () => {
  const ydoc = new Y.Doc()
  const ytext = ydoc.get('text')
  ytext.insert(0, 'hello world')
  const v1 = Y.cloneDoc(ydoc)
  ydoc.transact(() => { ytext.delete(6, 5) })
  // materialize the cache under the base renderer
  t.assert(ytext.delta.equals(delta.create().insert('hello ').done()))
  /**
   * @type {any}
   */
  let captured = null
  ytext.on('delta', d => { captured = d })
  ytext.useRenderer(Y.createDiffRenderer(v1, ydoc))
  // a non-empty rendering diff was emitted only on the 'delta' channel
  t.assert(captured !== null && !captured.isEmpty())
  // and the cache now reflects the diff-rendered state
  t.assert(ytext.delta.equals(delta.create().insert('hello ').insert('world', null, { delete: [] }).done()))
}

/**
 * `YType` conforms to the lib0 `RDT` interface — verified at runtime with `$rdt.check` (replaces the
 * old compile-time `_assertYTypeIsRdt`).
 */
export const testRdtConformsToRdtSchema = () => {
  t.assert($rdt.check(new Y.Doc().get()))
  t.assert($rdt.check(new Y.Type()))
  t.assert(!$rdt.check({}))
  t.assert(!$rdt.check(null))
}

/**
 * Collect a type and all of its (non-deleted) nested `YType` descendants.
 *
 * @param {Y.Type<any>} root
 * @return {Array<Y.Type<any>>}
 */
const collectTypes = root => {
  /**
   * @type {Array<Y.Type<any>>}
   */
  const out = [root]
  for (let i = 0; i < out.length; i++) {
    out[i].forEach(c => { if (c instanceof Y.Type) out.push(c) })
    out[i].forEachAttr(v => { if (v instanceof Y.Type) out.push(v) })
  }
  return out
}

/**
 * Apply one random mutation to a random type in the tree rooted at `root`.
 *
 * @param {prng.PRNG} gen
 * @param {Y.Type<any>} root
 */
const applyRandomYTypeOp = (gen, root) => {
  const target = prng.oneOf(gen, collectTypes(root))
  switch (prng.int32(gen, 0, 4)) {
    case 0: // insert text
      target.insert(prng.int32(gen, 0, target.length), prng.word(gen))
      break
    case 1: // insert a nested type
      target.insert(prng.int32(gen, 0, target.length), [new Y.Type()])
      break
    case 2: // delete a range
      if (target.length > 0) {
        const p = prng.int32(gen, 0, target.length - 1)
        target.delete(p, prng.int32(gen, 1, math.min(3, target.length - p)))
      }
      break
    case 3: // format a range (add or remove bold)
      if (target.length > 0) {
        const p = prng.int32(gen, 0, target.length - 1)
        target.format(p, prng.int32(gen, 1, math.min(3, target.length - p)), { bold: prng.bool(gen) ? true : null })
      }
      break
    case 4: // set / delete a map attribute
      if (prng.bool(gen)) {
        target.setAttr(prng.oneOf(gen, ['a', 'b', 'c']), prng.word(gen))
      } else {
        target.deleteAttr(prng.oneOf(gen, ['a', 'b', 'c']))
      }
      break
  }
}

/**
 * Fuzz: after each random mutation, every type's maintained `delta` cache (at every nesting level)
 * must equal a fresh deep render `toDelta({ deep: true })`.
 *
 * @param {t.TestCase} tc
 */
export const testRdtDeltaFuzz = tc => {
  const ydoc = new Y.Doc()
  const root = ydoc.get('root')
  for (let i = 0; i < 300; i++) {
    applyRandomYTypeOp(tc.prng, root)
    collectTypes(root).forEach(type =>
      t.assert(type.delta.equals(type.toDelta({ deep: true })), `iter ${i}`))
  }
}

/**
 * Fuzz under a diffing renderer, across two synced replicas. Each replica is a "suggestion doc" that
 * diffs against its own fixed baseline clone (taken after some shared initial content). With the plain
 * diff renderer (no `attrs`), suggestion inserts render `{ insert: [] }` and deletes render
 * `{ delete: [] }` — identical on every replica — so the maintained, diff-attributed `delta` must
 * converge across replicas (and match a fresh deep render). The cache is kept current purely by the
 * `'delta'` event (no recompute).
 *
 * @param {t.TestCase} tc
 */
export const testRdtDeltaSuggestionConvergence = tc => {
  const { testConnector, users } = init(tc, { users: 2 })
  const [d0, d1] = users
  d0.get('root').insert(0, 'shared baseline content')
  testConnector.flushAllMessages()
  // each replica diffs against its own fixed baseline clone (plain diff renderer => {insert:[]}/{delete:[]})
  d0.get('root').useRenderer(Y.createDiffRenderer(Y.cloneDoc(d0), d0))
  d1.get('root').useRenderer(Y.createDiffRenderer(Y.cloneDoc(d1), d1))
  for (let i = 0; i < 300; i++) {
    applyRandomYTypeOp(tc.prng, prng.oneOf(tc.prng, users).get('root')) // includes format add/remove
    testConnector.flushAllMessages()
    const a = d0.get('root').delta
    const b = d1.get('root').delta
    t.assert(a.equals(b), `converge iter ${i}`) // the suggestion view is replica-independent
    t.assert(a.equals(d0.get('root').toDelta({ deep: true })), `canonical iter ${i}`) // and matches a fresh render
  }
}

/**
 * Regression (deterministic, seed 1): removing a format under a diffing renderer must keep the
 * incrementally-maintained `.delta` equal to a fresh `toDelta({ deep: true })`. The bug was in the
 * `ContentFormat` change-mode block of `toDelta` (src/ytype.js): un-formatting cleared the format
 * *value* but emitted only a context-skip for the format-*attribution*, so the maintained cache kept
 * a stale `{attribution:{format:{bold:[]}}}` on the un-formatted range and drifted (at iter 35). The
 * fix emits an explicit `attribution:{format:{<key>:null}}` clear on the retained range (only in a
 * change/diff render). This test pins that behavior; if it regresses, the drift reappears at iter 35.
 */
export const testRdtFormatRemovalDrift = () => {
  const gen = prng.create(1) // fixed seed → deterministic
  const docs = [new Y.Doc(), new Y.Doc()]
  const [d0, d1] = docs
  const sync = () => {
    Y.applyUpdate(d1, Y.encodeStateAsUpdate(d0, Y.encodeStateVector(d1)))
    Y.applyUpdate(d0, Y.encodeStateAsUpdate(d1, Y.encodeStateVector(d0)))
  }
  d0.get('root').insert(0, 'shared baseline content')
  sync()
  // each replica diffs against its own fixed baseline clone
  d0.get('root').useRenderer(Y.createDiffRenderer(Y.cloneDoc(d0), d0))
  d1.get('root').useRenderer(Y.createDiffRenderer(Y.cloneDoc(d1), d1))
  for (let i = 0; i < 40; i++) {
    applyRandomYTypeOp(gen, prng.oneOf(gen, docs).get('root'))
    sync()
    // read `.delta` every step so it is maintained incrementally (a single read at the end would
    // recompute fresh and hide the drift). The maintained delta MUST equal a fresh deep render.
    const cached = d0.get('root').delta
    const fresh = d0.get('root').toDelta({ deep: true })
    if (!cached.equals(fresh)) {
      console.error('iter ' + i + ' cached :', JSON.stringify(cached.toJSON()))
      console.error('iter ' + i + ' toDelta:', JSON.stringify(fresh.toJSON()))
    }
    t.assert(cached.equals(fresh), `iter ${i}: maintained .delta drifted from toDelta({ deep: true })`)
  }
}

/**
 * Regression (minimal, deterministic, no prng): re-bolding content by deleting a transient `bold:null`
 * marker under a diffing renderer must keep the maintained `delta` equal to a fresh deep render.
 *
 * Steps: bold all of "abcdef", un-bold "cd" (inserts a `bold:null` marker), then re-bold "cd" (which
 * DELETES that marker). The deleted marker surfaces `attrs == null` in the change render, so the
 * attribution context must be *preserved* (not cleared) for the re-bolded run; a fresh render sees the
 * resulting attributed `bold:true` marker and renders `{format:{bold:[]}}`, so the cache must match:
 *
 *   .delta == toDelta({deep}) == "abcdef"{bold, attr:{format:{bold:[]}}}
 */
export const testRdtFormatRebold = () => {
  const doc = new Y.Doc()
  const root = doc.get('root')
  root.insert(0, 'abcdef')
  // diff against a baseline taken BEFORE formatting => every format change is an attributed suggestion
  root.useRenderer(Y.createDiffRenderer(Y.cloneDoc(doc), doc))
  // first access starts maintaining the incremental cache (baseline == current, so no suggestions yet)
  t.assert(root.delta.equals(delta.create().insert('abcdef').done()))
  root.format(0, 6, { bold: true }) // all bold
  root.format(2, 2, { bold: null }) // un-bold "cd" (inserts a transient bold:null marker)
  root.format(2, 2, { bold: true }) // re-bold "cd" => DELETES that transient marker
  const cached = root.delta
  const fresh = root.toDelta({ deep: true })
  if (!cached.equals(fresh)) {
    console.error('rebold cached :', JSON.stringify(cached.toJSON()))
    console.error('rebold toDelta:', JSON.stringify(fresh.toJSON()))
  }
  t.assert(cached.equals(fresh), 'maintained .delta drifted from toDelta({ deep: true }) after re-bold')
}

/**
 * Regression (was a known bug — minimal, deterministic, no prng): inserting an embed (nested `Y.Type`)
 * into a bold run used to leave a spurious `attribution:{format:{bold:null}}` null-leaf on the embed in
 * the maintained `delta`, where a fresh deep render has none. Now fixed; this pins it.
 *
 * Two ops: bold "ab", then insert an embed between "a" and "b". Inserting into a formatted run makes
 * Yjs surround the embed with NEGATED markers (`[bold:null] <embed> [bold:true]`) so the embed is not
 * bold. In the change render of that insert, the new `bold:null` negation marker triggers the
 * format-attribution clear (a `null` leaf), and because the embed is a FRESH renderContent insert it
 * inherits that leaf — but unlike a text insert the null-leaf does NOT resolve away for a `ContentType`
 * (embed) insert, so it sticks in the cache. A full render (insert mode) never emits the leaf:
 *
 *   maintained .delta : "a"{bold,attr} | <embed>{attr:{format:{bold:null}, insert:[]}} | "b"{bold,attr}
 *   toDelta({deep})   : "a"{bold,attr} | <embed>{attr:{insert:[]}}                      | "b"{bold,attr}
 *
 * Root cause: the single `usedAttribution` context can't distinguish inserts (need absolute attribution,
 * no null-leaves) from retains (need the null-leaf clear) — the value dimension already splits these
 * (`currentFormats` for inserts vs `changedFormats` for retains); the attribution dimension does
 * not. (Note: a *third* op `format(1,1,{bold:null})` to un-bold the embed is a no-op — the embed is
 * already not bold — so it produces an empty transaction and fires no `'delta'` event.)
 */
export const testRdtFormatEmbedInBold = () => {
  const doc = new Y.Doc()
  const root = doc.get('root')
  root.insert(0, 'ab')
  root.useRenderer(Y.createDiffRenderer(Y.cloneDoc(doc), doc))
  // first access starts maintaining the incremental cache (baseline == current, so no suggestions yet)
  t.assert(root.delta.equals(delta.create().insert('ab').done()))
  root.format(0, 2, { bold: true }) // bold "ab"
  root.insert(1, [new Y.Type()]) // insert an embed inside the bold run: "a<T>b"
  const cached = root.delta
  const fresh = root.toDelta({ deep: true })
  if (!cached.equals(fresh)) {
    console.error('embed-in-bold cached :', JSON.stringify(cached.toJSON()))
    console.error('embed-in-bold toDelta:', JSON.stringify(fresh.toJSON()))
  }
  t.assert(cached.equals(fresh), 'maintained .delta drifted from toDelta({ deep: true }) after embed-in-bold insert')
}

/**
 * Regression (minimal, deterministic, no prng): formatting a char and then deleting it under a diffing
 * renderer used to leave the maintained `delta` with a stale bold value + `{format:{bold:[]}}`
 * attribution on the deleted char, where a fresh deep render keeps only the `{delete:[]}` suggestion.
 *
 *   maintained .delta : "a" { format:{bold:true}, attribution:{ format:{bold:[]}, delete:[] } }  (was)
 *   toDelta({deep})   : "a" { attribution:{ delete:[] } }                                        (correct)
 *
 * On delete, the format markers around the char are cleaned up (deleted) too; their insert+delete
 * suggestion nets to no attribution, so the change render skipped them and never undid the value +
 * attribution the format step had written to the cache. The fix (in `toDelta`): a retain emits the
 * format *diff* (`changedFormats`, which carries the `bold→null` clear), and a deleted format marker
 * that actually removes a format under an attributing renderer emits an explicit `{format:{<key>:null}}`
 * attribution clear. This was the stale-`{format:{bold:[]}}`-on-deleted-content (re-assert) class.
 */
export const testRdtFormatDeleteFormatted = () => {
  const doc = new Y.Doc()
  const root = doc.get('root')
  root.insert(0, 'a')
  root.useRenderer(Y.createDiffRenderer(Y.cloneDoc(doc), doc)) // baseline before formatting
  // start maintaining the incremental cache (baseline == current, so no suggestions yet)
  t.assert(root.delta.equals(delta.create().insert('a').done()))
  root.format(0, 1, { bold: true }) // bold "a"
  root.delete(0, 1) // delete "a"
  const cached = root.delta
  const fresh = root.toDelta({ deep: true })
  if (!cached.equals(fresh)) {
    console.error('delete-formatted cached :', JSON.stringify(cached.toJSON()))
    console.error('delete-formatted toDelta:', JSON.stringify(fresh.toJSON()))
  }
  t.assert(cached.equals(fresh), 'maintained .delta drifted from toDelta({ deep: true }) after format+delete')
}

/**
 * Sanity: the maintained `delta` equals both an explicit expected delta and a fresh deep render —
 * for flat content, nested children, and ongoing edits.
 */
export const testRdtDeltaSanity = () => {
  const ydoc = new Y.Doc()
  const root = ydoc.get('root')
  root.insert(0, 'hello')
  root.setAttr('k', 'v')
  t.assert(root.delta.equals(delta.create().insert('hello').setAttr('k', 'v').done()))
  t.assert(root.delta.equals(root.toDelta({ deep: true })))
  // nested child + ongoing edits keep delta == fresh deep render
  const child = new Y.Type()
  root.insert(5, [child])
  child.insert(0, 'world')
  t.assert(root.delta.equals(root.toDelta({ deep: true })))
  child.insert(5, '!')
  root.delete(0, 1)
  t.assert(root.delta.equals(root.toDelta({ deep: true })))
  // the nested child's own cache is consistent too
  t.assert(child.delta.equals(child.toDelta({ deep: true })))
  t.assert(child.delta.equals(delta.create().insert('world!').done()))
}

/**
 * Sanity: under a diffing-attribution renderer the maintained `delta` carries the expected
 * attribution markers and equals a fresh attributed deep render.
 */
export const testRdtDeltaAttributionSanity = () => {
  const ydoc = new Y.Doc()
  const root = ydoc.get('root')
  const v1 = Y.cloneDoc(ydoc)
  const attrs = new Y.Attributions()
  ydoc.on('update', (update, _origin, doc, tr) => {
    if (!tr.local) return
    const uid = doc.clientID.toString()
    const cids = Y.createContentIdsFromUpdate(update)
    Y.insertIntoIdMap(attrs.inserts, Y.createIdMapFromIdSet(cids.inserts, [Y.createContentAttribute('insert', uid)]))
    Y.insertIntoIdMap(attrs.deletes, Y.createIdMapFromIdSet(cids.deletes, [Y.createContentAttribute('delete', uid)]))
  })
  root.insert(0, 'hello') // a suggestion relative to v1
  const uid = ydoc.clientID.toString()
  root.useRenderer(Y.createDiffRenderer(v1, ydoc, { attrs }))
  t.assert(root.delta.equals(delta.create().insert('hello', null, { insert: [uid] }).done()))
  t.assert(root.delta.equals(root.toDelta({ deep: true })))
}

/**
 * Currently-failing repro: formatting across a suggestion-deleted range with an
 * accepting renderer (suggestionMode=false) drifts the maintained `.delta`
 * cache — the change render attributes the formatted runs
 * (`{format:{code:[]}}`) while a fresh deep render nets no format attribution
 * (the format committed to base; it is not a suggestion). Also reproduces with
 * two independent renderers on separate suggestion docs (fixed suggestionMode
 * flags), i.e. without flipping the flag: a suggestion-mode peer deletes, a
 * view-suggestions peer formats across the deleted range.
 */
export const testRdtFormatAcrossSuggestionDeletedDrift = () => {
  const doc = new Y.Doc({ gc: false })
  const suggestionDoc = new Y.Doc({ isSuggestionDoc: true, gc: false })
  const renderer = Y.createDiffRenderer(doc, suggestionDoc, { attrs: new Y.Attributions() })
  doc.get('prosemirror').applyDelta(
    delta.create().insert([delta.create('paragraph', {}, 'hello world')]).done()
  )
  const ytype = suggestionDoc.get('prosemirror')
  ytype.useRenderer(renderer)
  t.assert(ytype.delta != null) // materialize the maintained cache
  // suggestion-delete "llo " (stays a suggestion; still rendered, attributed)
  renderer.suggestionMode = true
  ytype.applyDelta(delta.create().modify(delta.create().retain(2).delete(4)).done())
  // as an accepting user, format across the still-rendered deleted range
  renderer.suggestionMode = false
  ytype.applyDelta(delta.create().modify(delta.create().retain(1).retain(6, { code: {} })).done())
  const cached = ytype.delta
  const fresh = ytype.toDelta({ deep: true })
  if (!cached.equals(fresh)) {
    console.error('cached:', JSON.stringify(cached.toJSON()))
    console.error('fresh :', JSON.stringify(fresh.toJSON()))
  }
  t.assert(cached.equals(fresh), 'maintained .delta must equal a fresh deep render')
}

/**
 * Fixture for the delivery-through-deleted-parents tests: base doc + suggestion doc with pinned
 * clientIDs (item/marker order at equal positions depends on clientID comparison — always pin, and
 * exercise both orderings where it matters), a `paragraph('hello world')` created on the base doc
 * (flows into the suggestion doc through the renderer), and optionally the diff renderer attached
 * to the suggestion doc's root.
 *
 * @param {number} baseClientID
 * @param {number} sdocClientID
 * @param {boolean} useRootRenderer
 */
const createSuggestionPair = (baseClientID, sdocClientID, useRootRenderer = true) => {
  const doc = new Y.Doc({ gc: false })
  doc.clientID = baseClientID
  const sdoc = new Y.Doc({ isSuggestionDoc: true, gc: false })
  sdoc.clientID = sdocClientID
  const renderer = Y.createDiffRenderer(doc, sdoc, { attrs: new Y.Attributions() })
  doc.get('prosemirror').applyDelta(
    delta.create().insert([delta.create('paragraph', {}, 'hello world')]).done()
  )
  const ytype = sdoc.get('prosemirror')
  if (useRootRenderer) ytype.useRenderer(renderer)
  return { doc, sdoc, renderer, ytype }
}

/**
 * A remote base-doc insert into a suggestion-deleted paragraph must reach the root's RDT surface:
 * the tombstone is still rendered by the diff renderer, so the change is visible. The event
 * bubbles through the deleted parent (tracked unconditionally in `changedParentTypes`, fired on
 * live ancestors), and the freshly inserted content — auto-deleted with its parent in the same
 * transaction (`insertSet ∩ deleteSet`) yet attributed by the renderer — renders as a fresh
 * insert carrying its delete attribution (`itemsToRender` includes `I∩D ∩ renderer.attributed`),
 * so the maintained cache stays equal to a fresh deep render.
 */
export const testRdtDeltaThroughDeletedParent = () => {
  for (const [baseClientID, sdocClientID] of [[1, 2], [2, 1]]) {
    const { doc, ytype } = createSuggestionPair(baseClientID, sdocClientID)
    t.assert(ytype.delta != null) // materialize the maintained cache
    let fired = 0
    /**
     * @type {any}
     */
    let captured = null
    ytype.on('delta', d => { fired++; captured = d })
    // suggestion-delete the whole paragraph (stays rendered as an attributed tombstone)
    ytype.applyDelta(delta.create().delete(1).done())
    t.assert(fired === 1)
    fired = 0
    // remote base edit inside the tombstone: integrates under the deleted paragraph in the
    // suggestion doc (and is auto-deleted with it) — must still fire the root's 'delta'
    doc.get('prosemirror').applyDelta(delta.create().modify(delta.create().retain(2).insert('XY')).done())
    t.assert(fired === 1, 'root delta fires for a change inside a suggestion-deleted paragraph')
    t.assert(captured !== null && !captured.isEmpty())
    const fresh = ytype.toDelta({ deep: true })
    t.assert(JSON.stringify(fresh.toJSON()).includes('XY'), 'fresh render shows the text inside the tombstone')
    const cached = ytype.delta
    if (!cached.equals(fresh)) {
      console.error('cached:', JSON.stringify(cached.toJSON()))
      console.error('fresh :', JSON.stringify(fresh.toJSON()))
    }
    t.assert(cached.equals(fresh), 'maintained .delta must equal a fresh deep render')
  }
}

/**
 * A remote base-doc insert of a whole *nested type* into a suggestion-deleted paragraph: the
 * fresh paragraph and all of its content are auto-deleted on integration yet attributed by the
 * renderer, so the change renders it as a deep fresh insert (mode-3 through the ContentType
 * branch) and the maintained cache stays equal to a fresh deep render.
 */
export const testRdtDeltaFreshTypeThroughDeletedParent = () => {
  for (const [baseClientID, sdocClientID] of [[1, 2], [2, 1]]) {
    const { doc, ytype } = createSuggestionPair(baseClientID, sdocClientID)
    t.assert(ytype.delta != null) // materialize the maintained cache
    let fired = 0
    ytype.on('delta', () => { fired++ })
    // suggestion-delete the whole paragraph (stays rendered as an attributed tombstone)
    ytype.applyDelta(delta.create().delete(1).done())
    fired = 0
    // remote base edit: insert a fresh nested paragraph inside the tombstone
    const freshParagraph = /** @type {any} */ (delta.create('paragraph', {}, 'fresh'))
    const inner = /** @type {any} */ (delta.create().retain(2).insert([freshParagraph]))
    doc.get('prosemirror').applyDelta(delta.create().modify(inner).done())
    t.assert(fired === 1, 'root delta fires for a fresh nested type inside a suggestion-deleted paragraph')
    const fresh = ytype.toDelta({ deep: true })
    t.assert(JSON.stringify(fresh.toJSON()).includes('fresh'), 'fresh render shows the nested type inside the tombstone')
    const cached = ytype.delta
    if (!cached.equals(fresh)) {
      console.error('cached:', JSON.stringify(cached.toJSON()))
      console.error('fresh :', JSON.stringify(fresh.toJSON()))
    }
    t.assert(cached.equals(fresh), 'maintained .delta must equal a fresh deep render')
  }
}

/**
 * Content inserted AND suggestion-deleted within the same transaction renders as nothing (a
 * suggested insert that was taken back is invisible), and the maintained cache stays consistent —
 * the `insertSet ∩ deleteSet` handling must not leak invisible content into the rendered state.
 */
export const testRdtDeltaSuggestedInsertThenDeleteInvisible = () => {
  for (const [baseClientID, sdocClientID] of [[1, 2], [2, 1]]) {
    const { sdoc, ytype } = createSuggestionPair(baseClientID, sdocClientID)
    t.assert(ytype.delta != null) // materialize the maintained cache
    // insert and delete the same content in ONE transaction on the suggestion doc
    sdoc.transact(() => {
      const par = /** @type {Y.Type} */ (ytype.get(0))
      par.applyDelta(delta.create().retain(2).insert('zz').done())
      par.applyDelta(delta.create().retain(2).delete(2).done())
    })
    const fresh = ytype.toDelta({ deep: true })
    t.assert(!JSON.stringify(fresh.toJSON()).includes('zz'), 'insert-then-deleted suggestion is invisible')
    const cached = ytype.delta
    if (!cached.equals(fresh)) {
      console.error('cached:', JSON.stringify(cached.toJSON()))
      console.error('fresh :', JSON.stringify(fresh.toJSON()))
    }
    t.assert(cached.equals(fresh), 'maintained .delta must equal a fresh deep render')
  }
}

/**
 * Freshness (mode 3) must be decided per id range, not per item: a nested transaction (created
 * from a 'delta' observer during another transaction's emit loop) has its freshly
 * inserted+deleted item merged into an older left neighbor by the OUTER transaction's cleanup
 * (`tryToMergeWithLefts`) before the nested transaction's events render. With a whole-item check
 * (`insertedItems.hasId(item.id)` — first id only) the fresh range would render as a spurious
 * `delete` op, removing content the cache legitimately holds.
 */
export const testRdtDeltaFreshRangeAfterItemMerge = () => {
  const doc = new Y.Doc({ gc: false })
  doc.clientID = 1
  const sdoc = new Y.Doc({ isSuggestionDoc: true, gc: false })
  sdoc.clientID = 2
  const renderer = Y.createDiffRenderer(doc, sdoc, { attrs: new Y.Attributions() })
  doc.get('t').applyDelta(delta.create().insert('XY').done())
  const ytype = sdoc.get('t')
  ytype.useRenderer(renderer)
  t.assert(ytype.delta != null) // materialize the maintained cache
  let reacted = false
  ytype.on('delta', change => {
    if (reacted || !JSON.stringify(change.toJSON()).includes('"a"')) return
    reacted = true
    // nested transaction, cleaned up after the outer one: insert 'b' right after the suggested
    // 'a' (adjacent clock, same client), then delete both — the outer cleanup merges the two
    // deleted items into one before this transaction's events render
    sdoc.transact(() => {
      ytype.applyDelta(delta.create().retain(1).insert('b').done())
      ytype.applyDelta(delta.create().delete(2).done())
    })
  })
  // outer transaction: suggested insert 'a' at position 0
  ytype.applyDelta(delta.create().insert('a').done())
  t.assert(reacted)
  const cached = ytype.delta
  const fresh = ytype.toDelta({ deep: true })
  if (!cached.equals(fresh)) {
    console.error('cached:', JSON.stringify(cached.toJSON()))
    console.error('fresh :', JSON.stringify(fresh.toJSON()))
  }
  t.assert(cached.equals(fresh), 'maintained .delta must equal a fresh deep render')
}

/**
 * The lib0 `RDT` fix contract for a *fully reverted* apply: nothing landed on the doc, the
 * maintained cache stays consistent, and `before.apply(d).apply(fix)` round-trips back to the
 * actual (unchanged) rendered state — the fix is the inverse of the unapplied change.
 *
 * @param {any} ytype the type whose maintained `.delta` cache to check (must be materialized)
 * @param {any} before deep render of `ytype` captured before the apply
 * @param {any} d the change that was (not) applied
 * @param {any} fix the fix `applyDelta` returned
 */
const assertRevertedApply = (ytype, before, d, fix) => {
  const fresh = ytype.toDelta({ deep: true })
  t.assert(delta.diff(before, fresh).isEmpty(), 'nothing was applied to the doc')
  t.assert(ytype.delta.equals(fresh), 'maintained .delta must equal a fresh deep render')
  const roundTrip = delta.cloneDeep(before)
  roundTrip.apply(delta.cloneDeep(d), { final: true, move: true })
  if (fix !== null) {
    roundTrip.apply(delta.cloneDeep(fix), { final: true, move: true })
  }
  t.assert(delta.diff(roundTrip, fresh).isEmpty(), 'the fix round-trips the expected state back to the actual state')
}

/**
 * Modifying a suggestion-deleted (rendered) node must not apply anything — `applyDelta` returns
 * the reverted operation (the inverse of the nested change) as the RDT fix, emits no 'delta'
 * event (nothing changed), and leaves doc + cache untouched.
 */
export const testRdtApplyDeltaModifyIntoTombstoneReturnsInverse = () => {
  for (const [baseClientID, sdocClientID] of [[1, 2], [2, 1]]) {
    const { ytype } = createSuggestionPair(baseClientID, sdocClientID)
    t.assert(ytype.delta != null) // materialize the maintained cache
    ytype.applyDelta(delta.create().delete(1).done())
    const before = ytype.toDelta({ deep: true })
    let fired = 0
    ytype.on('delta', () => { fired++ })
    const d = delta.create().modify(delta.create().retain(2).insert('XY')).done()
    const fix = ytype.applyDelta(d)
    t.assert(fix !== null, 'the reverted operation is returned')
    t.compare(/** @type {any} */ (fix).toJSON(), delta.create().modify(delta.create().retain(2).delete(2)).done().toJSON())
    t.assert(fired === 0, 'a fully reverted apply emits no delta event')
    t.assert(!JSON.stringify(ytype.toDelta({ deep: true }).toJSON()).includes('XY'), 'the insert was not applied')
    assertRevertedApply(ytype, before, d, fix)
  }
}

/**
 * Deleting content inside a tombstone: the fix re-inserts the deleted range from the rendered
 * base state, restoring its stored attribution (the caller's view shows the content
 * delete-attributed — the revert must bring exactly that back).
 */
export const testRdtApplyDeltaDeleteInsideTombstoneInverse = () => {
  for (const [baseClientID, sdocClientID] of [[1, 2], [2, 1]]) {
    const { ytype } = createSuggestionPair(baseClientID, sdocClientID)
    t.assert(ytype.delta != null)
    ytype.applyDelta(delta.create().delete(1).done())
    const before = ytype.toDelta({ deep: true })
    const d = delta.create().modify(delta.create().retain(2).delete(4)).done()
    const fix = ytype.applyDelta(d)
    t.assert(fix !== null)
    const fixJson = JSON.stringify(/** @type {any} */ (fix).toJSON())
    t.assert(fixJson.includes('llo '), 'the fix re-inserts the deleted range')
    t.assert(fixJson.includes('"delete"'), 'the re-insert restores the stored delete attribution')
    assertRevertedApply(ytype, before, d, fix)
  }
}

/**
 * Formatting content inside a tombstone: not applied (no markers created); the fix clears the
 * format keys back to the base values (`{ bold: null }` for a previously unformatted range).
 */
export const testRdtApplyDeltaFormatInsideTombstoneInverse = () => {
  for (const [baseClientID, sdocClientID] of [[1, 2], [2, 1]]) {
    const { ytype } = createSuggestionPair(baseClientID, sdocClientID)
    t.assert(ytype.delta != null)
    ytype.applyDelta(delta.create().delete(1).done())
    const before = ytype.toDelta({ deep: true })
    const d = delta.create().modify(delta.create().retain(1).retain(4, { bold: {} })).done()
    const fix = ytype.applyDelta(d)
    t.assert(fix !== null)
    t.compare(/** @type {any} */ (fix).toJSON(), delta.create().modify(delta.create().retain(1).retain(4, { bold: null })).done().toJSON())
    assertRevertedApply(ytype, before, d, fix)
  }
}

/**
 * A `modify` carrying node formats on a tombstone: `op.format` is not applied either, and the fix
 * restores the *previous* format value — read from the cursor's format context AFTER stepping to
 * the node, so an alive format marker between the walk's start and the node is accounted for.
 */
export const testRdtApplyDeltaNodeFormatOnTombstoneInverse = () => {
  for (const [baseClientID, sdocClientID] of [[1, 2], [2, 1]]) {
    const doc = new Y.Doc({ gc: false })
    doc.clientID = baseClientID
    const sdoc = new Y.Doc({ isSuggestionDoc: true, gc: false })
    sdoc.clientID = sdocClientID
    const renderer = Y.createDiffRenderer(doc, sdoc, { attrs: new Y.Attributions() })
    doc.get('prosemirror').applyDelta(
      delta.create().insert([delta.create('paragraph', {}, 'aa'), delta.create('paragraph', {}, 'bb')]).done()
    )
    // base-doc node format over both paragraphs: an alive `align` marker sits before the first one
    doc.get('prosemirror').applyDelta(delta.create().retain(2, { align: 'x' }).done())
    const ytype = sdoc.get('prosemirror')
    ytype.useRenderer(renderer)
    t.assert(ytype.delta != null)
    // suggestion-delete the second paragraph
    ytype.applyDelta(delta.create().retain(1).delete(1).done())
    const before = ytype.toDelta({ deep: true })
    const d = delta.create().retain(1).modify(delta.create(), { align: 'y' }).done()
    const fix = ytype.applyDelta(d)
    t.assert(fix !== null)
    t.compare(/** @type {any} */ (fix).toJSON(), delta.create().retain(1).modify(delta.create(), { align: 'x' }).done().toJSON())
    assertRevertedApply(ytype, before, d, fix)
  }
}

/**
 * Applied and reverted ops coexist in one delta: ops on live content land (one 'delta' event),
 * only the tombstone-targeting modify reverts — and the fix's retain pad is measured in the
 * caller's *expected* space (including `d`'s own earlier insert).
 */
export const testRdtApplyDeltaMixedFixCoordinates = () => {
  for (const [baseClientID, sdocClientID] of [[1, 2], [2, 1]]) {
    const doc = new Y.Doc({ gc: false })
    doc.clientID = baseClientID
    const sdoc = new Y.Doc({ isSuggestionDoc: true, gc: false })
    sdoc.clientID = sdocClientID
    const renderer = Y.createDiffRenderer(doc, sdoc, { attrs: new Y.Attributions() })
    doc.get('prosemirror').applyDelta(
      delta.create().insert([
        delta.create('paragraph', {}, 'aa'), delta.create('paragraph', {}, 'hello world'), delta.create('paragraph', {}, 'cc')
      ]).done()
    )
    const ytype = sdoc.get('prosemirror')
    ytype.useRenderer(renderer)
    t.assert(ytype.delta != null)
    // suggestion-delete the middle paragraph
    ytype.applyDelta(delta.create().retain(1).delete(1).done())
    let fired = 0
    ytype.on('delta', () => { fired++ })
    const innerXY = /** @type {any} */ (delta.create().retain(2).insert('XY'))
    const innerZZ = /** @type {any} */ (delta.create().retain(2).insert('ZZ'))
    const pNew = /** @type {any} */ (delta.create('paragraph', {}, 'nn'))
    const d = /** @type {any} */ (delta.create()).insert([pNew]).retain(1).modify(innerXY).modify(innerZZ).done()
    const fix = ytype.applyDelta(d)
    t.assert(fired === 1, 'the applied part of the change emits exactly one delta event')
    t.assert(fix !== null)
    t.compare(/** @type {any} */ (fix).toJSON(), delta.create().retain(2).modify(delta.create().retain(2).delete(2)).done().toJSON())
    const fresh = JSON.stringify(ytype.toDelta({ deep: true }).toJSON())
    t.assert(fresh.includes('nn') && fresh.includes('ZZ'), 'ops on live content were applied')
    t.assert(!fresh.includes('XY'), 'the tombstone-targeting modify was not applied')
    t.assert(ytype.delta.equals(ytype.toDelta({ deep: true })), 'maintained .delta must equal a fresh deep render')
  }
}

/**
 * `modifyAttr` addressing a suggestion-deleted (still rendered) map value: the renderer-aware
 * lookup finds the tombstone, nothing is applied, and the fix wraps the inverse in a
 * `modifyAttr` — previously this hit `unexpectedCase` (`typeMapGet` is blind to deleted items).
 */
export const testRdtApplyDeltaModifyAttrOnDeletedMapValue = () => {
  for (const [baseClientID, sdocClientID] of [[1, 2], [2, 1]]) {
    const doc = new Y.Doc({ gc: false })
    doc.clientID = baseClientID
    const sdoc = new Y.Doc({ isSuggestionDoc: true, gc: false })
    sdoc.clientID = sdocClientID
    const renderer = Y.createDiffRenderer(doc, sdoc, { attrs: new Y.Attributions() })
    const title = doc.get('m').setAttr('title', new Y.Type())
    title.insert(0, 'hi')
    const m = sdoc.get('m')
    m.useRenderer(renderer)
    t.assert(m.delta != null)
    // suggestion-delete the attribute (stays rendered, delete-attributed)
    m.applyDelta(delta.create().deleteAttr('title').done())
    const before = m.toDelta({ deep: true })
    const d = delta.create().modifyAttr('title', delta.create().insert('X')).done()
    const fix = m.applyDelta(d)
    t.assert(fix !== null, 'no throw — the reverted operation is returned')
    t.compare(/** @type {any} */ (fix).toJSON(), delta.create().modifyAttr('title', delta.create().delete(1)).done().toJSON())
    assertRevertedApply(m, before, d, fix)
  }
}

/**
 * A plainly deleted (invisible — no renderer claims it) type keeps today's semantics: the apply
 * is silently dropped and `applyDelta` returns `null` (the caller's view shows nothing there, so
 * there is nothing to revert).
 */
export const testRdtApplyDeltaInvisibleDeletedSilentNull = () => {
  const doc = new Y.Doc({ gc: false })
  doc.clientID = 1
  const root = doc.get('prosemirror')
  root.applyDelta(delta.create().insert([delta.create('paragraph', {}, 'hello')]).done())
  const par = /** @type {Y.Type} */ (root.get(0))
  root.applyDelta(delta.create().delete(1).done())
  const res = par.applyDelta(delta.create().retain(2).insert('XY').done())
  t.assert(res === null, 'invisible deleted type: silent drop, no fix')
  t.assert(root.toDelta({ deep: true }).isEmpty(), 'nothing was applied')
}

/**
 * `applyDelta` called directly on a deleted-but-rendered type (the top-level guard): nothing is
 * applied and the inverse against the rendered state is returned. Without a renderer the same
 * call stays a silent `null` drop.
 */
export const testRdtApplyDeltaDirectGuardOnDeletedType = () => {
  for (const [baseClientID, sdocClientID] of [[1, 2], [2, 1]]) {
    const { ytype, renderer } = createSuggestionPair(baseClientID, sdocClientID)
    t.assert(ytype.delta != null)
    const par = /** @type {Y.Type} */ (ytype.get(0))
    ytype.applyDelta(delta.create().delete(1).done())
    const rootBefore = ytype.toDelta({ deep: true })
    const d = /** @type {any} */ (delta.create().retain(2).insert('XY').done())
    // children do not inherit the root's renderer — without one the node is invisible
    t.assert(par.applyDelta(d) === null, 'no renderer: silent drop')
    const fix = par.applyDelta(d, null, { renderer })
    t.assert(fix !== null)
    t.compare(/** @type {any} */ (fix).toJSON(), delta.create().retain(2).delete(2).done().toJSON())
    t.assert(delta.diff(rootBefore, ytype.toDelta({ deep: true })).isEmpty(), 'nothing was applied to the doc')
    t.assert(ytype.delta.equals(ytype.toDelta({ deep: true })), 'maintained .delta must equal a fresh deep render')
    // fix round-trip at the node level, against its rendered state
    const parBefore = /** @type {any} */ (par.toDelta({ deep: true, renderer }))
    const roundTrip = /** @type {any} */ (delta.cloneDeep(parBefore))
    roundTrip.apply(delta.cloneDeep(d), { final: true, move: true })
    roundTrip.apply(delta.cloneDeep(/** @type {any} */ (fix)), { final: true, move: true })
    t.assert(delta.diff(roundTrip, par.toDelta({ deep: true, renderer })).isEmpty(), 'the fix round-trips at the node level')
  }
}

/**
 * A tombstone grandchild behind an alive child: the alive child's applyDelta bubbles the nested
 * fix, and the parent wraps it positionally — `modify(modify(inverse))`.
 */
export const testRdtApplyDeltaNestedTombstoneFixBubbles = () => {
  for (const [baseClientID, sdocClientID] of [[1, 2], [2, 1]]) {
    const doc = new Y.Doc({ gc: false })
    doc.clientID = baseClientID
    const sdoc = new Y.Doc({ isSuggestionDoc: true, gc: false })
    sdoc.clientID = sdocClientID
    const renderer = Y.createDiffRenderer(doc, sdoc, { attrs: new Y.Attributions() })
    doc.get('prosemirror').applyDelta(
      delta.create().insert([delta.create('paragraph', {}, [delta.create('nested', {}, 'ww')])]).done()
    )
    const ytype = sdoc.get('prosemirror')
    ytype.useRenderer(renderer)
    t.assert(ytype.delta != null)
    // suggestion-delete only the nested node inside the (alive) paragraph
    const par = /** @type {Y.Type} */ (ytype.get(0))
    par.applyDelta(delta.create().delete(1).done(), null, { renderer })
    const before = ytype.toDelta({ deep: true })
    const innerX = /** @type {any} */ (delta.create().insert('X'))
    const midModify = /** @type {any} */ (delta.create().modify(innerX))
    const d = delta.create().modify(midModify).done()
    const fix = ytype.applyDelta(d)
    t.assert(fix !== null)
    const innerDel = /** @type {any} */ (delta.create().delete(1))
    const midModifyDel = /** @type {any} */ (delta.create().modify(innerDel))
    t.compare(/** @type {any} */ (fix).toJSON(), delta.create().modify(midModifyDel).done().toJSON())
    assertRevertedApply(ytype, before, d, fix)
  }
}

/**
 * A plain `delete` op spanning a tombstone keeps its existing semantics (suggestion-deletes the
 * alive content, records the attributed range) and returns no fix — the known, downstream-healed
 * gap; pinned here so a change of behavior is a conscious one.
 */
export const testRdtApplyDeltaPureDeleteOverTombstoneNoFix = () => {
  for (const [baseClientID, sdocClientID] of [[1, 2], [2, 1]]) {
    const doc = new Y.Doc({ gc: false })
    doc.clientID = baseClientID
    const sdoc = new Y.Doc({ isSuggestionDoc: true, gc: false })
    sdoc.clientID = sdocClientID
    const renderer = Y.createDiffRenderer(doc, sdoc, { attrs: new Y.Attributions() })
    doc.get('prosemirror').applyDelta(
      delta.create().insert([
        delta.create('paragraph', {}, 'aa'), delta.create('paragraph', {}, 'hello world'), delta.create('paragraph', {}, 'cc')
      ]).done()
    )
    const ytype = sdoc.get('prosemirror')
    ytype.useRenderer(renderer)
    t.assert(ytype.delta != null)
    ytype.applyDelta(delta.create().retain(1).delete(1).done())
    const res = ytype.applyDelta(delta.create().delete(3).done())
    t.assert(res === null, 'a plain delete over a tombstone range returns no fix')
    const fresh = ytype.toDelta({ deep: true })
    t.assert(ytype.delta.equals(fresh), 'maintained .delta must equal a fresh deep render')
  }
}

/**
 * A `delete` op ending mid-way through a struck (attributed-deleted) chunk must split the item at
 * the consumption boundary — otherwise the cursor advances past the whole chunk and every
 * following op of the same delta targets too far right (the modify walk then reverts the WRONG
 * node, returning a fix that carries another node's content).
 */
export const testRdtApplyDeltaDeleteMidStruckChunkKeepsCursorSync = () => {
  for (const [baseClientID, sdocClientID] of [[1, 2], [2, 1]]) {
    const doc = new Y.Doc({ gc: false })
    doc.clientID = baseClientID
    const sdoc = new Y.Doc({ isSuggestionDoc: true, gc: false })
    sdoc.clientID = sdocClientID
    const renderer = Y.createDiffRenderer(doc, sdoc, { attrs: new Y.Attributions() })
    doc.get('t').applyDelta(delta.create().insert('abc').done())
    doc.get('t').applyDelta(delta.create().retain(3).insert([delta.create('nA', {}, 'kk'), delta.create('nB', {}, 'qqq')]).done())
    const ytype = sdoc.get('t')
    ytype.useRenderer(renderer)
    t.assert(ytype.delta != null)
    // strike 'bc' (one 2-unit chunk) and both nodes
    ytype.applyDelta(delta.create().retain(1).delete(2).done())
    ytype.applyDelta(delta.create().retain(3).delete(2).done())
    const before = ytype.toDelta({ deep: true })
    // delete struck 'b' (ends MID-chunk), retain struck 'c', revert-modify tombstone nA
    const inner = /** @type {any} */ (delta.create().delete(2))
    const d = delta.create().retain(1).delete(1).retain(1).modify(inner).done()
    const fix = ytype.applyDelta(d)
    t.assert(fix !== null)
    const fixJson = JSON.stringify(/** @type {any} */ (fix).toJSON())
    t.assert(fixJson.includes('kk') && !fixJson.includes('qq'), "the fix restores nA's content, not nB's")
    const fresh = ytype.toDelta({ deep: true })
    t.assert(delta.diff(before, fresh).isEmpty(), 'nothing was applied (struck delete is meta-only, modify reverted)')
    t.assert(ytype.delta.equals(fresh), 'maintained .delta must equal a fresh deep render')
  }
}

/**
 * A change *inside* a suggestion-deleted (still rendered) attr value must re-emit: the deleted
 * value has no modifyAttr path, so the change render re-emits the full-state `setAttr` (an
 * idempotent replace) whenever the value type is in `modified` — else the maintained cache and
 * every RDT consumer go permanently stale.
 */
export const testRdtDeltaThroughDeletedAttrValue = () => {
  for (const [baseClientID, sdocClientID] of [[1, 2], [2, 1]]) {
    const doc = new Y.Doc({ gc: false })
    doc.clientID = baseClientID
    const sdoc = new Y.Doc({ isSuggestionDoc: true, gc: false })
    sdoc.clientID = sdocClientID
    const renderer = Y.createDiffRenderer(doc, sdoc, { attrs: new Y.Attributions() })
    const title = doc.get('m').setAttr('title', new Y.Type())
    title.insert(0, 'hi')
    const m = sdoc.get('m')
    m.useRenderer(renderer)
    t.assert(m.delta != null)
    m.applyDelta(delta.create().deleteAttr('title').done())
    t.assert(m.delta.equals(m.toDelta({ deep: true })), 'cache consistent after the suggestion deleteAttr')
    let fired = 0
    m.on('delta', () => { fired++ })
    // base-doc edit INSIDE the tombstone attr value
    doc.get('m').getAttr('title').insert(2, 'XY')
    t.assert(fired === 1, "'delta' fires for a change inside the tombstone attr value")
    const fresh = m.toDelta({ deep: true })
    t.assert(JSON.stringify(fresh.toJSON()).includes('XY'), 'fresh render shows the edit')
    t.assert(m.delta.equals(fresh), 'maintained .delta must equal a fresh deep render')
  }
}

/**
 * A remote base-doc format inside a suggestion-deleted paragraph: full contract — the root's
 * 'delta' fires and the maintained cache equals a fresh deep render (fresh-deleted format markers
 * stay on the retained-marker path of the format state machine).
 */
export const testRdtDeltaFormatThroughDeletedParent = () => {
  for (const [baseClientID, sdocClientID] of [[1, 2], [2, 1]]) {
    const { doc, ytype } = createSuggestionPair(baseClientID, sdocClientID)
    t.assert(ytype.delta != null) // materialize the maintained cache
    ytype.applyDelta(delta.create().delete(1).done()) // suggestion-delete the paragraph
    let fired = 0
    ytype.on('delta', () => { fired++ })
    doc.get('prosemirror').applyDelta(delta.create().modify(delta.create().retain(1).retain(4, { bold: {} })).done())
    t.assert(fired === 1, 'root delta fires for a format inside a suggestion-deleted paragraph')
    const cached = ytype.delta
    const fresh = ytype.toDelta({ deep: true })
    if (!cached.equals(fresh)) {
      console.error('cached:', JSON.stringify(cached.toJSON()))
      console.error('fresh :', JSON.stringify(fresh.toJSON()))
    }
    t.assert(cached.equals(fresh), 'maintained .delta must equal a fresh deep render')
  }
}

/**
 * Plain docs (base renderer): deleted content is invisible, so a remote change inside a deleted
 * paragraph emits no 'delta' (the change renders to an empty delta, which is suppressed) and v1
 * `observe` semantics are unchanged. Deep listeners on live ancestors ARE notified now (the event
 * is tracked through the deleted parent) — that is the chosen semantics.
 */
export const testRdtNoDeltaThroughDeletedParentPlainDoc = () => {
  const docP = new Y.Doc({ gc: false })
  docP.clientID = 3
  const docQ = new Y.Doc({ gc: false })
  docQ.clientID = 4
  docP.get('prosemirror').applyDelta(
    delta.create().insert([delta.create('paragraph', {}, 'hello world')]).done()
  )
  Y.applyUpdate(docQ, Y.encodeStateAsUpdate(docP))
  const rootQ = docQ.get('prosemirror')
  t.assert(rootQ.delta != null) // materialize the maintained cache
  let deltaFired = 0
  let deepFired = 0
  let observeFired = 0
  rootQ.on('delta', () => { deltaFired++ })
  rootQ.observeDeep(() => { deepFired++ })
  rootQ.observe(() => { observeFired++ })
  // plain-delete the paragraph on Q — a visible change, fires normally
  rootQ.applyDelta(delta.create().delete(1).done())
  t.assert(deltaFired === 1 && observeFired === 1)
  deltaFired = 0
  deepFired = 0
  observeFired = 0
  // remote edit inside the (invisible) deleted paragraph
  docP.get('prosemirror').applyDelta(delta.create().modify(delta.create().retain(2).insert('XY')).done())
  Y.applyUpdate(docQ, Y.encodeStateAsUpdate(docP))
  t.assert(deltaFired === 0, 'no delta emission for an invisible change')
  t.assert(observeFired === 0, 'v1 observe on the root is unaffected')
  t.assert(deepFired === 1, 'deep listeners on live ancestors are notified')
  t.assert(rootQ.delta.equals(rootQ.toDelta({ deep: true })), 'maintained cache stays equal to a fresh render')
}

/**
 * A deleted type with its OWN custom renderer keeps firing (its content is still rendered): the
 * deletion transaction and later remote edits inside the tombstone reach its `observe`/'delta'
 * and keep its maintained cache current — while a base-renderer root above it stays silent for
 * changes it cannot see.
 */
export const testRdtDeletedTypeWithOwnRendererFires = () => {
  const { doc, renderer, ytype } = createSuggestionPair(1, 2, false)
  const parB = /** @type {any} */ (ytype.get(0))
  parB.useRenderer(renderer)
  t.assert(parB.delta != null) // materialize the maintained cache
  t.assert(ytype.delta != null) // root cache, maintained under the base renderer
  let parFired = 0
  let parObserved = 0
  let rootFired = 0
  parB.on('delta', () => { parFired++ })
  parB.observe(() => { parObserved++ })
  ytype.on('delta', () => { rootFired++ })
  // delete the paragraph (a visible change on the root; the paragraph itself becomes a tombstone
  // that its own diff renderer still renders)
  ytype.applyDelta(delta.create().delete(1).done())
  t.assert(rootFired === 1, 'root fires for its own visible delete')
  t.assert(parB.delta.equals(parB.toDelta({ deep: true })), 'deleted type cache current after the deletion')
  const parFiredAfterDelete = parFired
  // remote format inside the tombstone: the deleted type fires; the base-renderer root renders
  // nothing and must not emit an empty delta
  doc.get('prosemirror').applyDelta(delta.create().modify(delta.create().retain(1).retain(4, { bold: {} })).done())
  t.assert(parFired === parFiredAfterDelete + 1, 'deleted type with its own renderer fires delta')
  t.assert(parObserved >= 1, 'deleted type with its own renderer fires observe')
  t.assert(rootFired === 1, 'base-renderer root does not emit empty deltas')
  t.assert(parB.delta.equals(parB.toDelta({ deep: true })), 'deleted type cache current after the remote format')
  t.assert(ytype.delta.equals(ytype.toDelta({ deep: true })), 'root cache stays equal to a fresh render')
}

/**
 * Type-scoped UndoManager: tombstone-subtree transactions now reach `changedParentTypes` (the
 * scope check), but origin gating still decides capture — an untracked-origin remote change is
 * not captured.
 */
export const testRdtDeletedSubtreeUndoScope = () => {
  const docP = new Y.Doc({ gc: false })
  docP.clientID = 5
  const docQ = new Y.Doc({ gc: false })
  docQ.clientID = 6
  docP.get('prosemirror').applyDelta(
    delta.create().insert([delta.create('paragraph', {}, 'hello world')]).done()
  )
  Y.applyUpdate(docQ, Y.encodeStateAsUpdate(docP))
  const rootQ = docQ.get('prosemirror')
  const um = new Y.UndoManager(rootQ)
  rootQ.applyDelta(delta.create().delete(1).done()) // local delete → captured
  t.assert(um.undoStack.length === 1)
  // remote change inside the deleted paragraph with an untracked origin: in scope via the
  // deleted-parent bubble, but not captured
  docP.get('prosemirror').applyDelta(delta.create().modify(delta.create().retain(2).insert('XY')).done())
  Y.applyUpdate(docQ, Y.encodeStateAsUpdate(docP), 'remote-origin')
  t.assert(um.undoStack.length === 1, 'untracked-origin remote change is not captured')
}

/**
 * Currently-failing repro: an *accepting* (suggestionMode=false) child-node insert with no
 * suggested content anywhere drifts the maintained `.delta` cache. The inserted node reaches the
 * base doc (asserted below — it is committed content, NOT a suggestion, so the
 * "inserted-adjacent-to-suggested-is-suggested" rule does not apply), and a fresh deep render
 * correctly shows no attribution — but the cache keeps the change render's transient
 * `{insert: []}` attribution. Suggestion-mode inserts and accepting inserts adjacent to suggested
 * content are consistent (both sides attributed); only this committed-insert case drifts.
 * Delete-tail + insert-node is the CRDT shape of a ProseMirror block split, so editor workloads
 * hit this constantly.
 */
export const testRdtAcceptingNodeInsertCacheDrift = () => {
  const doc = new Y.Doc({ gc: false })
  const suggestionDoc = new Y.Doc({ isSuggestionDoc: true, gc: false })
  const renderer = Y.createDiffRenderer(doc, suggestionDoc, { attrs: new Y.Attributions() })
  renderer.suggestionMode = false
  doc.get('prosemirror').applyDelta(
    delta.create().insert([delta.create('paragraph', {}, 'base para')]).done()
  )
  const ytype = suggestionDoc.get('prosemirror')
  ytype.useRenderer(renderer)
  t.assert(ytype.delta != null) // materialize the maintained cache
  ytype.applyDelta(delta.create().retain(1).insert([delta.create('paragraph', {}, 'plain')]).done())
  // the insert is committed content: it reached the base doc
  t.assert(JSON.stringify(doc.get('prosemirror').toDeltaDeep().toJSON()).includes('plain'), 'the insert committed to base')
  const cached = ytype.delta
  const fresh = ytype.toDelta({ deep: true })
  t.assert(!JSON.stringify(fresh.toJSON()).includes('"attribution"'), 'fresh render shows committed (unattributed) content')
  if (!cached.equals(fresh)) {
    console.error('cached:', JSON.stringify(cached.toJSON()))
    console.error('fresh :', JSON.stringify(fresh.toJSON()))
  }
  t.assert(cached.equals(fresh), 'maintained .delta must equal a fresh deep render')
  // same class, second entry point: ACCEPTING a suggested node-insert. The suggested insert
  // itself is consistent (both sides attributed), but the accept's de-attribution correction
  // does not descend into the nested node's content — the cache keeps `{insert: []}`.
  {
    const doc2 = new Y.Doc({ gc: false })
    const suggestionDoc2 = new Y.Doc({ isSuggestionDoc: true, gc: false })
    const renderer2 = Y.createDiffRenderer(doc2, suggestionDoc2, { attrs: new Y.Attributions() })
    doc2.get('prosemirror').applyDelta(delta.create().insert([delta.create('paragraph', {}, 'base para')]).done())
    const ytype2 = suggestionDoc2.get('prosemirror')
    ytype2.useRenderer(renderer2)
    t.assert(ytype2.delta != null) // materialize the maintained cache
    renderer2.suggestionMode = true
    ytype2.applyDelta(delta.create().retain(1).insert([delta.create('paragraph', {}, 'sugg')]).done())
    t.assert(ytype2.delta.equals(ytype2.toDelta({ deep: true })), 'suggested insert itself is consistent')
    renderer2.acceptAllChanges()
    t.assert(ytype2.delta.equals(ytype2.toDelta({ deep: true })), 'maintained .delta must equal a fresh render after accepting the node insert')
  }
}

/**
 * Currently-failing repro — the consumer-visible framing of the cache drift above: inserting a
 * node through an *accepting* renderer (`suggestionMode = false`) must not leave it presented as
 * a suggestion. The write currently emits two `'delta'` events: first the insert render, fully
 * attributed (`{insert: []}` on the inserted node AND its nested content), then a de-attribution
 * correction `retain(1).retain(1, {attribution: null})` once the content commits to base — but
 * the correction only clears the attribution on the node itself and never descends into the
 * node's children. Composing the event stream (which is exactly how the maintained `.delta`
 * cache is built) therefore leaves the nested text attributed as a suggested insert forever,
 * while ground truth (a fresh deep render) shows committed, unattributed content. The test does
 * not prescribe the fix: it passes if the insert render arrives unattributed OR if the
 * correction descends — it only requires the settled event stream to converge to the truth.
 */
export const testRdtAcceptingNodeInsertRenderedAsSuggestion = () => {
  const doc = new Y.Doc({ gc: false })
  const suggestionDoc = new Y.Doc({ isSuggestionDoc: true, gc: false })
  const renderer = Y.createDiffRenderer(doc, suggestionDoc, { attrs: new Y.Attributions() })
  renderer.suggestionMode = false
  doc.get('prosemirror').applyDelta(
    delta.create().insert([delta.create('paragraph', {}, 'base para')]).done()
  )
  const ytype = suggestionDoc.get('prosemirror')
  ytype.useRenderer(renderer)
  // composed = pre-write state + every emitted change: what any consumer of the `'delta'`
  // channel (a remote binding, the maintained cache) believes the document looks like
  const composed = delta.cloneDeep(/** @type {any} */ (ytype.toDelta({ deep: true })))
  ytype.on('delta', d => {
    composed.apply(/** @type {any} */ (delta.cloneDeep(/** @type {any} */ (d))), { final: true, move: true })
  })
  ytype.applyDelta(delta.create().retain(1).insert([delta.create('paragraph', {}, 'plain')]).done())
  const fresh = ytype.toDelta({ deep: true })
  t.assert(!JSON.stringify(fresh.toJSON()).includes('"attribution"'), 'ground truth: the insert committed to base, nothing is suggested')
  if (!composed.equals(fresh)) {
    console.error('composed:', JSON.stringify(composed.toJSON()))
    console.error('fresh   :', JSON.stringify(fresh.toJSON()))
  }
  t.assert(!JSON.stringify(composed.toJSON()).includes('"attribution"'), 'the settled event stream must not present the committed insert as a suggestion')
  t.assert(composed.equals(fresh), 'composing the emitted changes converges to a fresh render')
  // deeper nesting must heal at *every* level below the top, not just the first
  ytype.applyDelta(delta.create().retain(2).insert([delta.create('blockquote', {}, [delta.create('paragraph', {}, 'deep')])]).done())
  const fresh2 = ytype.toDelta({ deep: true })
  t.assert(!JSON.stringify(fresh2.toJSON()).includes('"attribution"'), 'ground truth: the multi-level insert committed to base')
  t.assert(!JSON.stringify(composed.toJSON()).includes('"attribution"'), 'no nesting level is left presented as a suggestion')
  t.assert(composed.equals(fresh2), 'the event stream converges for multi-level nesting')
}

/**
 * Guards the id-scoped heal design: unattributing an accepted node must never cascade into a
 * blanket subtree clear, because children may still be attributed. Here only the node's OWN
 * insert-suggestion is accepted (`acceptChanges` with a range covering just the node id) — the
 * node commits to base as an empty paragraph while its text children remain pending
 * suggestions. The heal must clear the node's attribution, keep the children's `{insert: []}`,
 * and keep the maintained cache equal to a fresh render.
 */
export const testRdtPartialAcceptKeepsPendingChildSuggestions = () => {
  const doc = new Y.Doc({ gc: false })
  const suggestionDoc = new Y.Doc({ isSuggestionDoc: true, gc: false })
  const renderer = Y.createDiffRenderer(doc, suggestionDoc, { attrs: new Y.Attributions() })
  doc.get('prosemirror').applyDelta(delta.create().insert([delta.create('paragraph', {}, 'base para')]).done())
  const ytype = suggestionDoc.get('prosemirror')
  ytype.useRenderer(renderer)
  t.assert(ytype.delta != null) // materialize the maintained cache
  renderer.suggestionMode = true
  const client = suggestionDoc.clientID
  // suggestion 1: node insert — the paragraph node takes clock 0, its text 'x' clock 1
  ytype.applyDelta(delta.create().retain(1).insert([delta.create('paragraph', {}, 'x')]).done())
  // suggestion 2: more text inside the suggested node
  ytype.applyDelta(delta.create().retain(1).modify(delta.create().retain(1).insert('Q')).done())
  t.assert(ytype.delta.equals(ytype.toDelta({ deep: true })), 'consistent before the partial accept')
  // accept ONLY the node's own id (clock 0); every child stays a pending suggestion
  renderer.acceptChanges(Y.createID(client, 0))
  const cached = ytype.delta
  const fresh = ytype.toDelta({ deep: true })
  const freshJson = /** @type {any} */ (fresh.toJSON())
  // ground truth: the node committed (as an empty paragraph) …
  t.assert(JSON.stringify(doc.get('prosemirror').toDeltaDeep().toJSON()).split('"paragraph"').length === 3, 'the accepted node reached the base doc')
  t.assert(freshJson.children[0].attribution === undefined, 'the accepted node itself is no longer attributed')
  // … while its children are still suggested
  const acceptedPara = freshJson.children[0].insert[1]
  t.assert(acceptedPara.name === 'paragraph' && JSON.stringify(acceptedPara.children).includes('"attribution":{"insert":[]}'), 'pending child suggestions keep their attribution')
  if (!cached.equals(fresh)) {
    console.error('cached:', JSON.stringify(cached.toJSON()))
    console.error('fresh :', JSON.stringify(fresh.toJSON()))
  }
  t.assert(cached.equals(fresh), 'maintained .delta must equal a fresh deep render after the partial accept')
}
