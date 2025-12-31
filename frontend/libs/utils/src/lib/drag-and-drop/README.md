# Drag and Drop Directive

A flexible Angular directive that enables drag and drop functionality on any element with support for custom drag previews.

## Usage

### Basic Example

```html
<div 
  [dragAndDropData]="myData" 
  [dragAndDropKind]="'item'"
  [draggingEnabled]="true"
>
  Drag me!
</div>
```

### With Dynamic Data

```html
<div 
  *ngFor="let item of items" 
  [dragAndDropData]="item" 
  [dragAndDropKind]="'list-item'"
  [draggingEnabled]="!item.locked"
  class="draggable-item"
>
  {{ item.name }}
</div>
```

### File Drag Example

```html
<div 
  [dragAndDropData]="file" 
  [dragAndDropKind]="'file'"
  class="file-item"
>
  <img [src]="file.thumbnail" />
  <span>{{ file.name }}</span>
</div>
```

### Custom Drag Preview

```html
<!-- Custom drag preview template -->
<ng-template #dragPreview let-data let-kind="kind">
  <div class="custom-drag-preview">
    <i class="icon-{{kind}}"></i>
    <span>{{data.name}}</span>
    <small>({{kind}})</small>
  </div>
</ng-template>

<!-- Element with custom drag preview -->
<div 
  [dragAndDropData]="item" 
  [dragAndDropKind]="'custom-item'"
  [dragPreviewTemplate]="dragPreview"
  class="draggable-item"
>
  {{ item.name }}
</div>
```

### Advanced Custom Preview

```html
<ng-template #complexPreview let-data>
  <div class="drag-preview-card">
    <div class="preview-header">
      <img [src]="data.avatar" class="avatar" />
      <span class="title">{{ data.title }}</span>
    </div>
    <div class="preview-content">
      <p>{{ data.description }}</p>
      <div class="preview-tags">
        <span *ngFor="let tag of data.tags" class="tag">{{ tag }}</span>
      </div>
    </div>
  </div>
</ng-template>

<div 
  [dragAndDropData]="complexItem" 
  [dragAndDropKind]="'complex'"
  [dragPreviewTemplate]="complexPreview"
  class="complex-item"
>
  <!-- Regular display content -->
  <h3>{{ complexItem.title }}</h3>
  <p>{{ complexItem.summary }}</p>
</div>
```

## Inputs

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `libDragAndDropData` | `any` | `undefined` | The data to be transferred during drag operation |
| `libDragAndDropKind` | `string` | `''` | A string identifier for the type of data being dragged |
| `draggingEnabled` | `boolean` | `true` | Whether drag and drop is enabled on this element |

## Features

- ✅ **Mouse drag support** - Standard HTML5 drag and drop
- ✅ **Touch support** - Works on mobile devices
- ✅ **Data transfer** - Passes data through DragAndDropService
- ✅ **Visual feedback** - Adds CSS classes during drag
- ✅ **Conditional enabling** - Can be dynamically enabled/disabled
- ✅ **Type identification** - Kind property for identifying drag types
- ✅ **Standalone directive** - Works with Angular standalone components

## Integration with DragAndDropService

The directive automatically integrates with the `DragAndDropService`:

```typescript
// In your drop target component
constructor(private dragDropService: DragAndDropService) {}

onDrop() {
  const draggedData = this.dragDropService.data;
  const draggedKind = this.dragDropService.dataKind;
  
  if (draggedKind === 'file') {
    this.handleFileDropped(draggedData);
  }
}
```

## CSS Classes

The directive automatically adds/removes these CSS classes:

- `.dragging` - Applied during drag operation
- Custom cursor styles are applied based on drag state

## Styling

Include the directive styles or create your own:

```scss
[libDragAndDrop] {
  transition: opacity 0.2s ease, transform 0.2s ease;
  
  &.dragging {
    opacity: 0.7;
    transform: scale(0.95);
  }
  
  &:hover {
    transform: scale(1.02);
  }
}
```

## Events

The directive works with the global DragAndDropService events:

- `isDragging$` - Observable indicating if any drag operation is active
- `dragState$` - Observable with current drag coordinates and operation type
