from libs.fun.ascii import merge_horizontal


def get_leopar_art():
    return """

                          _ __  _
                         ;'   '',)
                         /;6 , ;/
                        (Y)_:., |
                         `-', :; \\
                           |;  ,.:\\
                          /:.;   ;;)
                         |:;,.'|  :/
                        / |:  / ; /
                       /:;\\ `| "//
                      /_,: | |./,|
                    /_: \\.'|,|/| |
                   /:.,:.|,|"| |:|
                  /:;:|:,/;|:| |'|
                 |',:| \\_ \\ |_|;\\_
                 /;\\_ /\\_)) \\_))\\_))
                (;(________
                 '''''`'''~`


        """

def get_leopar_name():
    return r"""

leopar

    """


def print_leopar_welcome():
    """Print the Preciso logo with a hand below."""
    print(get_leopar_art(), get_leopar_name(), sep="\n")
