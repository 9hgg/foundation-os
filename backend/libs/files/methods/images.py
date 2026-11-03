import cv2
import structlog

logger = structlog.get_logger(__name__)

############################################################
#                                                          #
#                         IMAGES                           #
#                                                          #
############################################################


def generate_square_centered_image(filename: str, output: str):
    """
    Generate a cropped and centered square image, matching the RSS standard width and height.
    """
    img = cv2.imread(filename)
    if img is None:
        return None

    width = img.shape[1]
    height = img.shape[0]
    logger.debug("square_image_loaded", width=width, height=height)
    min_size = 1400
    max_size = 3000
    max_bytes = 500_000
    jpeg_quality = 100

    # determine the target size of the cropped image
    target_size = min(width, height)

    # Calculate the x and y coordinates of the top-left corner of the square image from the original
    x = width // 2 - target_size // 2
    y = height // 2 - target_size // 2

    # Crop the image from the calculated coordinates
    cropped_img = img[y : y + target_size, x : x + target_size]

    # Resize the image if necessary
    if target_size < min_size:
        logger.debug("square_image_upscaling", original_size=target_size, target_size=min_size)
        cropped_img = cv2.resize(cropped_img, (min_size, min_size))
    elif target_size > max_size:
        logger.debug("square_image_downscaling", original_size=target_size, target_size=max_size)
        cropped_img = cv2.resize(cropped_img, (max_size, max_size))

    # Check the size of the image
    img_size_bytes = len(cv2.imencode(".jpg", cropped_img)[1])
    logger.debug("square_image_encoded", size_bytes=img_size_bytes, jpeg_quality=jpeg_quality)
    while img_size_bytes > max_bytes:
        logger.debug(
            "square_image_recompressing",
            size_bytes=img_size_bytes,
            max_bytes=max_bytes,
            jpeg_quality=jpeg_quality,
        )
        jpeg_quality -= 5
        if jpeg_quality <= 0:
            return None
        successfull_encoding, img_data = cv2.imencode(".jpg", cropped_img, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality])
        img_size_bytes = len(img_data)
        logger.debug("square_image_recompressed", size_bytes=img_size_bytes, jpeg_quality=jpeg_quality)
    cv2.imwrite(output, cropped_img, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality])
