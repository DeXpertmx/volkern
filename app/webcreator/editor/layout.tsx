/**
 * This layout provides the fullscreen structure for the webcreator.
 */
export default function EditorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="h-screen w-screen overflow-hidden bg-white">
      {children}
    </div>
  )
}
