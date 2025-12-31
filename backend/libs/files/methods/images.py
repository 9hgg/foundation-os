import cv2

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
    print("(generate_square_centered_image): image width:", width)
    print("(generate_square_centered_image): image height:", height)
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
        print(
            "(generate_square_centered_image): image too small, will be upscaled to:",
            min_size,
        )
        cropped_img = cv2.resize(cropped_img, (min_size, min_size))
    elif target_size > max_size:
        print(
            "(generate_square_centered_image): image too large, will be downscaled to:",
            max_size,
        )
        cropped_img = cv2.resize(cropped_img, (max_size, max_size))

    # Check the size of the image
    img_size_bytes = len(cv2.imencode(".jpg", cropped_img)[1])
    print("image size ############################", img_size_bytes)
    while img_size_bytes > max_bytes:
        print(
            f"(generate_square_centered_image): image size {img_size_bytes} bytes is above the maximum allowed {max_bytes} bytes. \nCompressing image with quality {jpeg_quality}"
        )
        jpeg_quality -= 5
        if jpeg_quality <= 0:
            return None
        successfull_encoding, img_data = cv2.imencode(".jpg", cropped_img, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality])
        img_size_bytes = len(img_data)
        print("new image size ############################", img_size_bytes)
    cv2.imwrite(output, cropped_img, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality])
