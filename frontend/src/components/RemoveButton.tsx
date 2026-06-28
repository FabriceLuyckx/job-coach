import Button from './Button'

/** The one delete control used wherever a list item is removed. */
export default function RemoveButton({ onClick, title = 'Remove' }: { onClick: () => void; title?: string }) {
  return <Button variant="danger" icon aria-label={title} title={title} onClick={onClick}>×</Button>
}
