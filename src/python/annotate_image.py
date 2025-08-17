#!/usr/bin/env python3
"""
Professional Image Annotation with OpenCV
Draws bounding boxes and labels on images with high-quality rendering.
"""

import cv2
import numpy as np
import json
import sys
import requests
from typing import List, Dict, Any, Tuple
import tempfile
import os


class ImageAnnotator:
    """Professional image annotation using OpenCV with high-quality rendering."""
    
    def __init__(self):
        self.color_map = {
            # Financial entities
            'total_amount': (129, 185, 16),        # emerald-500 (BGR)
            'subtotal': (129, 185, 16),
            'tax': (11, 158, 245),                 # amber-500 (BGR)
            'vendor_name': (246, 92, 139),         # violet-500 (BGR)
            'transaction_date': (246, 130, 59),    # blue-500 (BGR)
            'document_type': (128, 114, 107),      # gray-500 (BGR)
            'invoice_number': (153, 72, 236),      # pink-500 (BGR)
            
            # Line item fields
            'line_item_description': (105, 150, 5),      # emerald-600 (BGR)
            'line_item_quantity': (178, 145, 8),         # cyan-600 (BGR)
            'line_item_unit_price': (18, 45, 124),       # red-900 (BGR)
            'line_item_line_total': (52, 101, 22),       # green-800 (BGR)
            'line_item_row': (81, 65, 55),               # gray-700 (BGR)
            
            # Default
            'default': (246, 130, 59)  # blue-500 (BGR)
        }
        
        self.font = cv2.FONT_HERSHEY_SIMPLEX
        self.font_scale = 0.6
        self.font_thickness = 2
        self.box_thickness = 3
        self.label_padding = 8
        
    def download_image(self, url: str) -> np.ndarray:
        """Download image from URL and return as OpenCV image array."""
        try:
            print(f"[Annotation] Downloading image from: {url}")
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            
            # Convert to numpy array
            image_array = np.frombuffer(response.content, np.uint8)
            # Decode image
            image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
            
            if image is None:
                raise ValueError("Failed to decode image")
                
            print(f"[Annotation] Image loaded: {image.shape[1]}x{image.shape[0]}")
            return image
            
        except Exception as e:
            raise Exception(f"Failed to download image: {str(e)}")
    
    def format_category_name(self, category: str) -> str:
        """Format category name for display."""
        # Remove line_item_ prefix and replace underscores with spaces
        formatted = category.replace('line_item_', '').replace('_', ' ')
        # Capitalize each word
        return ' '.join(word.capitalize() for word in formatted.split())
    
    def calculate_text_size(self, text: str) -> Tuple[int, int]:
        """Calculate text size for proper label sizing."""
        (text_width, text_height), baseline = cv2.getTextSize(
            text, self.font, self.font_scale, self.font_thickness
        )
        return text_width, text_height + baseline
    
    def draw_rounded_rectangle(self, image: np.ndarray, top_left: Tuple[int, int], 
                             bottom_right: Tuple[int, int], color: Tuple[int, int, int], 
                             thickness: int = -1, radius: int = 6) -> None:
        """Draw a rounded rectangle (approximate using multiple rectangles)."""
        x1, y1 = top_left
        x2, y2 = bottom_right
        
        if thickness == -1:  # Filled rectangle
            # Main rectangle
            cv2.rectangle(image, (x1 + radius, y1), (x2 - radius, y2), color, -1)
            cv2.rectangle(image, (x1, y1 + radius), (x2, y2 - radius), color, -1)
            
            # Corner circles (approximate rounded corners)
            cv2.circle(image, (x1 + radius, y1 + radius), radius, color, -1)
            cv2.circle(image, (x2 - radius, y1 + radius), radius, color, -1)
            cv2.circle(image, (x1 + radius, y2 - radius), radius, color, -1)
            cv2.circle(image, (x2 - radius, y2 - radius), radius, color, -1)
        else:
            # Outline rectangle (simplified for now)
            cv2.rectangle(image, top_left, bottom_right, color, thickness)
    
    def annotate_image(self, image: np.ndarray, bounding_boxes: List[Dict[str, Any]]) -> np.ndarray:
        """Annotate image with bounding boxes and labels."""
        annotated_image = image.copy()
        height, width = image.shape[:2]
        
        print(f"[Annotation] Drawing {len(bounding_boxes)} bounding boxes")
        
        for i, box in enumerate(bounding_boxes):
            try:
                # Extract coordinates
                x1, y1, x2, y2 = int(box['x1']), int(box['y1']), int(box['x2']), int(box['y2'])
                category = box.get('category', 'default')
                text = box.get('text', '')
                
                # Validate box dimensions
                if x2 <= x1 or y2 <= y1:
                    print(f"[Annotation] Skipping invalid box {i}: {box}")
                    continue
                
                # Ensure coordinates are within image bounds
                x1 = max(0, min(x1, width))
                y1 = max(0, min(y1, height))
                x2 = max(x1, min(x2, width))
                y2 = max(y1, min(y2, height))
                
                # Get color for category
                color = self.color_map.get(category, self.color_map['default'])
                
                # Draw semi-transparent fill
                overlay = annotated_image.copy()
                cv2.rectangle(overlay, (x1, y1), (x2, y2), color, -1)
                cv2.addWeighted(annotated_image, 0.85, overlay, 0.15, 0, annotated_image)
                
                # Draw dashed border (approximate with dotted line)
                self.draw_dashed_rectangle(annotated_image, (x1, y1), (x2, y2), color)
                
                # Prepare label text
                category_name = self.format_category_name(category)
                label_text = f"{category_name}: {text[:35]}{'...' if len(text) > 35 else ''}"
                
                # Calculate label dimensions
                text_width, text_height = self.calculate_text_size(label_text)
                label_width = text_width + (self.label_padding * 2)
                label_height = text_height + (self.label_padding * 2)
                
                # Smart label positioning
                label_x = x1
                label_y = y1 - label_height - 5
                
                # If label goes above image, place it inside the box
                if label_y < 0:
                    label_y = y1 + 5
                
                # Ensure label doesn't go off edges
                if label_x + label_width > width:
                    label_x = width - label_width - 5
                label_x = max(5, label_x)
                
                # Draw label background with transparency
                label_bg_color = (0, 0, 0)  # Black background
                label_overlay = annotated_image.copy()
                
                self.draw_rounded_rectangle(
                    label_overlay,
                    (label_x, label_y),
                    (label_x + label_width, label_y + label_height),
                    label_bg_color,
                    thickness=-1,
                    radius=4
                )
                
                # Apply transparency to label background
                cv2.addWeighted(annotated_image, 0.2, label_overlay, 0.8, 0, annotated_image)
                
                # Draw label border
                self.draw_rounded_rectangle(
                    annotated_image,
                    (label_x, label_y),
                    (label_x + label_width, label_y + label_height),
                    color,
                    thickness=1
                )
                
                # Draw text with shadow for better readability
                text_x = label_x + self.label_padding
                text_y = label_y + text_height - 2
                
                # Text shadow
                cv2.putText(annotated_image, label_text, (text_x + 1, text_y + 1),
                           self.font, self.font_scale, (0, 0, 0), self.font_thickness + 1)
                
                # Main text
                cv2.putText(annotated_image, label_text, (text_x, text_y),
                           self.font, self.font_scale, (255, 255, 255), self.font_thickness)
                
                print(f"[Annotation] Drew box {i}: {category_name} at [{x1},{y1},{x2},{y2}]")
                
            except Exception as e:
                print(f"[Annotation] Error processing box {i}: {str(e)}")
                continue
        
        return annotated_image
    
    def draw_dashed_rectangle(self, image: np.ndarray, top_left: Tuple[int, int], 
                             bottom_right: Tuple[int, int], color: Tuple[int, int, int],
                             dash_length: int = 12, gap_length: int = 6) -> None:
        """Draw a dashed rectangle border."""
        x1, y1 = top_left
        x2, y2 = bottom_right
        
        # Top edge
        self.draw_dashed_line(image, (x1, y1), (x2, y1), color, dash_length, gap_length)
        # Right edge
        self.draw_dashed_line(image, (x2, y1), (x2, y2), color, dash_length, gap_length)
        # Bottom edge
        self.draw_dashed_line(image, (x2, y2), (x1, y2), color, dash_length, gap_length)
        # Left edge
        self.draw_dashed_line(image, (x1, y2), (x1, y1), color, dash_length, gap_length)
    
    def draw_dashed_line(self, image: np.ndarray, pt1: Tuple[int, int], pt2: Tuple[int, int],
                        color: Tuple[int, int, int], dash_length: int = 12, gap_length: int = 6) -> None:
        """Draw a dashed line between two points."""
        x1, y1 = pt1
        x2, y2 = pt2
        
        # Calculate line length and direction
        dx = x2 - x1
        dy = y2 - y1
        length = int(np.sqrt(dx*dx + dy*dy))
        
        if length == 0:
            return
        
        # Unit vector
        ux = dx / length
        uy = dy / length
        
        # Draw dashes
        current_pos = 0
        while current_pos < length:
            # Start of dash
            start_x = int(x1 + current_pos * ux)
            start_y = int(y1 + current_pos * uy)
            
            # End of dash
            end_pos = min(current_pos + dash_length, length)
            end_x = int(x1 + end_pos * ux)
            end_y = int(y1 + end_pos * uy)
            
            # Draw dash
            cv2.line(image, (start_x, start_y), (end_x, end_y), color, self.box_thickness)
            
            # Move to next dash
            current_pos += dash_length + gap_length
    
    def save_image(self, image: np.ndarray, quality: int = 95) -> str:
        """Save annotated image to temporary file and return path."""
        try:
            # Create temporary file
            temp_fd, temp_path = tempfile.mkstemp(suffix='.png')
            os.close(temp_fd)  # Close file descriptor, we'll use cv2.imwrite
            
            # Set PNG compression parameters for high quality
            encode_params = [cv2.IMWRITE_PNG_COMPRESSION, 6]  # 0-9, lower is better quality
            
            # Save image
            success = cv2.imwrite(temp_path, image, encode_params)
            if not success:
                raise Exception("Failed to save image")
            
            file_size = os.path.getsize(temp_path)
            print(f"[Annotation] Saved annotated image: {file_size} bytes")
            
            return temp_path
            
        except Exception as e:
            raise Exception(f"Failed to save image: {str(e)}")


def main():
    """Main function to process command line arguments and annotate image."""
    if len(sys.argv) != 3:
        print("Usage: python annotate_image.py <image_url> <bounding_boxes_json>")
        sys.exit(1)
    
    try:
        image_url = sys.argv[1]
        bounding_boxes_json = sys.argv[2]
        
        # Parse bounding boxes
        bounding_boxes = json.loads(bounding_boxes_json)
        
        print(f"[Annotation] Processing {len(bounding_boxes)} bounding boxes")
        
        # Initialize annotator
        annotator = ImageAnnotator()
        
        # Download and process image
        image = annotator.download_image(image_url)
        annotated_image = annotator.annotate_image(image, bounding_boxes)
        
        # Save annotated image
        output_path = annotator.save_image(annotated_image)
        
        # Return result as JSON
        result = {
            "success": True,
            "output_path": output_path,
            "original_size": {
                "width": image.shape[1],
                "height": image.shape[0]
            },
            "annotations_count": len(bounding_boxes)
        }
        
        print(json.dumps(result))
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(error_result))
        sys.exit(1)


if __name__ == "__main__":
    main()