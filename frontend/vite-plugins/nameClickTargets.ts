import { parse } from '@babel/parser'
import MagicString from 'magic-string'
import type { Plugin } from 'vite'

// Gives every button and link in the app a stable analytics name at build time, as a `data-attr`
// attribute (what PostHog autocapture reads), so each click shows up as "Component.what-it-says"
// instead of an anonymous element. Nothing in the source files changes.
//
// The name is built only from text that is written in the source (never from what is on screen),
// so it can never contain a person's name: static text, or a literal aria-label / title, with any
// dynamic part dropped. A target that already has its own `data-attr` keeps it.
const TARGETS = new Set(['button', 'a', 'NavLink', 'Link'])

type Node = { type: string; start: number; end: number; [key: string]: any }

const kebab = (text: string) => text.replace(/([a-z0-9])([A-Z])/g, '$1 $2')

const slug = (text: string) =>
  text.replace(/\s+/g, ' ').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

const jsxName = (name: Node): string => {
  if (name.type === 'JSXIdentifier') return name.name
  return ''
}

const attrOf = (el: Node, attr: string): Node | undefined =>
  el.openingElement.attributes.find((a: Node) => a.type === 'JSXAttribute' && a.name?.name === attr)

const literalValue = (attr: Node | undefined): string => {
  const v = attr?.value
  if (!v) return ''
  if (v.type === 'StringLiteral') return v.value
  if (v.type === 'JSXExpressionContainer') {
    if (v.expression.type === 'StringLiteral') return v.expression.value
    if (v.expression.type === 'TemplateLiteral' && v.expression.expressions.length === 0) return v.expression.quasis[0].value.cooked ?? ''
  }
  return ''
}

// The name of what a click calls: onClick={handleSave}, onClick={() => setOpen(true)}, onClick={() => { void save() }}.
const calleeName = (fn: Node | undefined): string => {
  if (!fn) return ''
  if (fn.type === 'Identifier') return fn.name
  if (fn.type === 'MemberExpression' && fn.property?.type === 'Identifier') return fn.property.name
  if (fn.type === 'CallExpression') return calleeName(fn.callee)
  if (fn.type === 'UnaryExpression' || fn.type === 'AwaitExpression') return calleeName(fn.argument)
  if (fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression') {
    const body = fn.body
    if (body.type === 'BlockStatement') {
      const first = body.body.find((st: Node) => st.type === 'ExpressionStatement' || st.type === 'ReturnStatement')
      return calleeName(first?.expression ?? first?.argument)
    }
    return calleeName(body)
  }
  return ''
}

const handlerName = (el: Node): string => {
  const attr = attrOf(el, 'onClick')
  const expr = attr?.value?.type === 'JSXExpressionContainer' ? attr.value.expression : undefined
  return kebab(calleeName(expr))
}

// A link's destination, from the literal part of `to` / `href` only (ids in template strings are dropped).
const destination = (el: Node): string => {
  const attr = attrOf(el, 'to') ?? attrOf(el, 'href')
  const v = attr?.value
  if (!v) return ''
  if (v.type === 'StringLiteral') return v.value.split('?')[0]
  if (v.type === 'JSXExpressionContainer' && v.expression.type === 'TemplateLiteral') return (v.expression.quasis[0].value.cooked ?? '').split('?')[0]
  if (v.type === 'JSXExpressionContainer' && v.expression.type === 'StringLiteral') return v.expression.value.split('?')[0]
  return ''
}

// Only literal text counts; {expressions} are skipped, and so are nested elements except their own literal text.
const staticText = (node: Node): string => {
  switch (node.type) {
    case 'JSXText': return node.value
    case 'StringLiteral': return node.value
    case 'JSXElement': case 'JSXFragment': return node.children.map(staticText).join(' ')
    case 'JSXExpressionContainer': {
      const e = node.expression
      if (e.type === 'StringLiteral') return e.value
      if (e.type === 'TemplateLiteral') return e.quasis.map((q: Node) => q.value.cooked ?? '').join(' ')
      if (e.type === 'ConditionalExpression') return [e.consequent, e.alternate].map((b: Node) => (b.type === 'StringLiteral' ? b.value : '')).join(' ')
      return ''
    }
    default: return ''
  }
}

export default function nameClickTargets(): Plugin {
  return {
    name: 'name-click-targets',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]
      if (!file.endsWith('.tsx') || file.includes('node_modules')) return null
      if (!/<(button|a|NavLink|Link)[\s>]/.test(code)) return null
      let ast: Node
      try {
        ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] }) as unknown as Node
      } catch {
        return null
      }
      const base = file.split('/').pop()!.replace(/\.tsx$/, '')
      const s = new MagicString(code)
      const used = new Map<string, number>()
      let changed = false

      const visit = (node: Node | null | undefined, owner: string) => {
        if (!node || typeof node.type !== 'string') return
        let here = owner
        if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id?.name) here = node.id.name
        if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && /^[A-Z]/.test(node.id.name)) here = node.id.name
        if (node.type === 'JSXElement') {
          const tag = jsxName(node.openingElement.name)
          if (TARGETS.has(tag) && !attrOf(node, 'data-attr')) {
            const label = slug(staticText({ type: 'JSXFragment', start: 0, end: 0, children: node.children } as Node))
              || slug(literalValue(attrOf(node, 'aria-label')))
              || slug(literalValue(attrOf(node, 'title')))
              || slug(destination(node) ? `to ${destination(node)}` : '')
              || slug(handlerName(node))
              || (tag === 'a' || tag === 'NavLink' || tag === 'Link' ? 'link' : 'button')
            const name = `${here || base}.${label}`
            const n = (used.get(name) ?? 0) + 1
            used.set(name, n)
            s.appendLeft(node.openingElement.name.end, ` data-attr="${name}${n > 1 ? `-${n}` : ''}"`)
            changed = true
          }
        }
        for (const key of Object.keys(node)) {
          if (key === 'loc' || key === 'type' || key === 'start' || key === 'end') continue
          const child = (node as any)[key]
          if (Array.isArray(child)) child.forEach((c) => visit(c, here))
          else if (child && typeof child === 'object') visit(child, here)
        }
      }
      visit(ast, '')
      if (!changed) return null
      return { code: s.toString(), map: s.generateMap({ hires: 'boundary' }) }
    },
  }
}
