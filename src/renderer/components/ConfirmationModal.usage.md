# ConfirmationModal Usage Guide

The `ConfirmationModal` is a reusable, mascot-friendly modal component that replaces all default browser popups (`window.confirm`, `window.alert`, etc.) with a consistent, styled modal that fits the Simanga theme.

## Basic Usage

### 1. Import the Component
```tsx
import ConfirmationModal from "./ConfirmationModal";
```

### 2. Add State Management
```tsx
const [showConfirmation, setShowConfirmation] = useState(false);
```

### 3. Add the Modal to Your JSX
```tsx
<ConfirmationModal
  isOpen={showConfirmation}
  onClose={() => setShowConfirmation(false)}
  onConfirm={(confirmed) => {
    if (confirmed) {
      // User clicked "Yes" - perform the action
      console.log("User confirmed!");
    }
    // Modal will close automatically
  }}
  title="Are you sure?"
  message="This action cannot be undone."
/>
```

### 4. Trigger the Modal
```tsx
<button onClick={() => setShowConfirmation(true)}>
  Delete Item
</button>
```

## Props Reference

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `isOpen` | boolean | ✅ | - | Controls modal visibility |
| `onClose` | () => void | ✅ | - | Called when modal should close |
| `onConfirm` | (confirmed: boolean) => void | ✅ | - | Called with true/false when user makes choice |
| `title` | string | ✅ | - | Main message/question to display |
| `message` | string | ❌ | - | Optional secondary message |
| `confirmText` | string | ❌ | "Yes" | Text for confirm button |
| `cancelText` | string | ❌ | "No" | Text for cancel button |
| `mascotImage` | string | ❌ | - | Optional mascot image URL |
| `variant` | "default" \| "warning" \| "danger" | ❌ | "default" | Button styling variant |

## Examples

### Basic Confirmation
```tsx
<ConfirmationModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  onConfirm={(confirmed) => {
    if (confirmed) {
      performAction();
    }
  }}
  title="Delete this item?"
/>
```

### Warning Modal with Custom Text
```tsx
<ConfirmationModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  onConfirm={(confirmed) => {
    if (confirmed) {
      enableNSFWContent();
    }
  }}
  title="Enable NSFW Content?"
  message="This will show adult content in search results."
  confirmText="Enable"
  cancelText="Cancel"
  variant="warning"
/>
```

### Danger Modal with Mascot
```tsx
<ConfirmationModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  onConfirm={(confirmed) => {
    if (confirmed) {
      deleteAllData();
    }
  }}
  title="Delete All Data?"
  message="This will permanently delete all your downloaded manga and settings."
  confirmText="Delete All"
  cancelText="Keep Data"
  mascotImage="/assets/mascot-worried.png"
  variant="danger"
/>
```

### Download All Chapters
```tsx
<ConfirmationModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  onConfirm={(confirmed) => {
    if (confirmed) {
      downloadAllChapters();
    }
  }}
  title="Download All Chapters?"
  message={`This will download all ${chapters.length} chapters. This may take a while.`}
  confirmText="Download All"
  cancelText="Cancel"
  mascotImage="/assets/mascot-happy.png"
/>
```

## Common Patterns

### Pattern 1: Simple Confirmation with Callback
```tsx
const [showModal, setShowModal] = useState(false);

const handleAction = () => {
  setShowModal(true);
};

const handleConfirm = (confirmed: boolean) => {
  if (confirmed) {
    // Perform the action
    console.log("Action confirmed!");
  }
  // No need to manually close - modal handles it
};

<ConfirmationModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  onConfirm={handleConfirm}
  title="Confirm Action"
/>
```

### Pattern 2: Pending Action State
```tsx
const [showModal, setShowModal] = useState(false);
const [pendingAction, setPendingAction] = useState<() => void>(() => {});

const confirmAction = (action: () => void) => {
  setPendingAction(() => action);
  setShowModal(true);
};

const handleConfirm = (confirmed: boolean) => {
  if (confirmed && pendingAction) {
    pendingAction();
  }
  setPendingAction(() => {});
};

// Usage
<button onClick={() => confirmAction(() => deleteItem(id))}>
  Delete
</button>
```

### Pattern 3: Async Actions
```tsx
const [showModal, setShowModal] = useState(false);
const [isLoading, setIsLoading] = useState(false);

const handleConfirm = async (confirmed: boolean) => {
  if (confirmed) {
    setIsLoading(true);
    try {
      await performAsyncAction();
    } finally {
      setIsLoading(false);
    }
  }
};

<ConfirmationModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  onConfirm={handleConfirm}
  title="Confirm Action"
  confirmText={isLoading ? "Processing..." : "Confirm"}
/>
```

## Variants

### Default (Blue)
- Use for general confirmations
- Blue confirm button
- Example: "Save changes?"

### Warning (Yellow)
- Use for potentially risky actions
- Yellow confirm button
- Example: "Enable NSFW content?"

### Danger (Red)
- Use for destructive actions
- Red confirm button
- Example: "Delete all data?"

## Best Practices

### 1. Use Descriptive Titles
```tsx
// ✅ Good - Clear and specific
title="Download All 127 Chapters?"

// ❌ Bad - Vague
title="Are you sure?"
```

### 2. Provide Context with Messages
```tsx
// ✅ Good - Explains consequences
title="Delete Bookmark?"
message="You can always bookmark this manga again later."

// ✅ Good - Shows impact
title="Download All Chapters?"
message="This will download 2.3 GB of data."
```

### 3. Use Appropriate Variants
```tsx
// ✅ Good - Matches severity
variant="danger" // for deletions
variant="warning" // for potentially unwanted changes
variant="default" // for general confirmations
```

### 4. Customize Button Text
```tsx
// ✅ Good - Action-specific
confirmText="Download All"
cancelText="Cancel"

// ✅ Good - Clear actions
confirmText="Delete"
cancelText="Keep"
```

### 5. Add Mascot Images for Personality
```tsx
// ✅ Good - Adds character
mascotImage="/assets/mascot-excited.png" // for positive actions
mascotImage="/assets/mascot-worried.png" // for concerning actions
```

## Migration from window.confirm

Replace this:
```tsx
// ❌ Old way
const confirmed = window.confirm("Delete this item?");
if (confirmed) {
  deleteItem();
}
```

With this:
```tsx
// ✅ New way
const [showConfirmation, setShowConfirmation] = useState(false);

// In your JSX
<button onClick={() => setShowConfirmation(true)}>
  Delete Item
</button>

<ConfirmationModal
  isOpen={showConfirmation}
  onClose={() => setShowConfirmation(false)}
  onConfirm={(confirmed) => {
    if (confirmed) {
      deleteItem();
    }
  }}
  title="Delete this item?"
  variant="danger"
/>
```

## Integration with Existing Code

The modal integrates seamlessly with existing patterns:

### With Download Manager
```tsx
const handleDownloadAll = () => {
  setShowDownloadModal(true);
};

<ConfirmationModal
  isOpen={showDownloadModal}
  onClose={() => setShowDownloadModal(false)}
  onConfirm={(confirmed) => {
    if (confirmed) {
      chapters.forEach(chapter => {
        downloadManager.downloadChapter(chapter);
      });
    }
  }}
  title="Download All Chapters?"
  message={`Download ${chapters.length} chapters?`}
  confirmText="Download All"
  cancelText="Cancel"
/>
```

### With Settings
```tsx
const handleToggleNSFW = () => {
  if (!settings.showNSFWContent) {
    setShowNSFWModal(true);
  } else {
    settings.setShowNSFWContent(false);
  }
};

<ConfirmationModal
  isOpen={showNSFWModal}
  onClose={() => setShowNSFWModal(false)}
  onConfirm={(confirmed) => {
    if (confirmed) {
      settings.setShowNSFWContent(true);
    }
  }}
  title="Enable NSFW Content?"
  message="This will show adult content in search results."
  confirmText="Enable"
  cancelText="Cancel"
  variant="warning"
/>
```

## Accessibility Features

The modal includes several accessibility features:
- **Focus Management**: Automatically focuses the modal when opened
- **Keyboard Navigation**: Tab navigation between buttons
- **Screen Reader Support**: Proper ARIA labels and roles
- **Backdrop Interaction**: Clicking outside closes the modal
- **Visual Feedback**: Clear visual states for buttons

## Performance Tips

1. **Conditional Rendering**: Only render the modal when needed
```tsx
{showModal && (
  <ConfirmationModal
    isOpen={showModal}
    // ... other props
  />
)}
```

2. **Memoization**: Use React.memo for static content
```tsx
const memoizedModal = React.memo(ConfirmationModal);
```

3. **Lazy Loading**: Load mascot images only when needed
```tsx
const mascotImage = showModal ? "/assets/mascot.png" : undefined;
```

## Styling

The modal uses Tailwind CSS classes and follows the existing Simanga design system:
- Dark theme (gray-800 background)
- Rounded corners
- Smooth animations
- Consistent spacing
- Backdrop blur effect

## Future Enhancements

Consider these additions for future versions:
- Loading state for async actions
- Custom icons instead of just mascot images
- Sound effects for different variants
- Keyboard shortcuts (Enter for confirm, Escape for cancel)
- Custom animations per variant

## Notes

- The modal automatically closes when a choice is made
- Clicking the backdrop cancels the action
- The component is fully accessible with proper focus management
- All animations are smooth and consistent with the app's design
- The mascot image is optional and should be used to add personality to important decisions
